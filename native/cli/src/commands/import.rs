//! Native `bit import` and `bit fetch`: the engine fetches, writes and
//! reports (`commandInbound*`). Wildcard patterns are listed on their remotes
//! first, and an import that writes components installs them afterwards
//! unless `-x` is given.

mod options;
mod patterns;
mod report;

use super::{
    color::Chalk,
    engine::Engine,
    installation,
    status::cache::cache_root,
    workspace_command::{self, NodeCli, progress::Progress, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, path::Path, time::Instant};

pub const IMPORT: Command = Command { name: "import", aliases: &[], run };
pub const FETCH: Command = Command { name: "fetch", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv) else {
        return Ok(Outcome::Declined("outside the native import grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let installer = match start_installer(&root, &options, &argv) {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("import: {error}"))),
    };
    let chalk = Chalk::detect(args);
    let selection = match patterns::select(&root, &options) {
        Ok(selection) => selection,
        Err(error) => return Ok(Outcome::Declined(format!("{}: {error}", options.operation))),
    };
    if selection.ids.is_empty() && !options.ids.is_empty() {
        return workspace_command::execute_then(&root, args, options.operation, |output| {
            render_selection(&options, &selection, output);
            Ok(Report { data: chalk.yellow("nothing to import"), code: 0, details: None })
        });
    }
    let mut planned = match Planned::plan(&root, &options, &selection.ids, chalk) {
        Ok(planned) => planned,
        Err(error) => return Ok(Outcome::Declined(format!("{}: {error}", options.operation))),
    };
    workspace_command::execute_then(&root, args, options.operation, |output| {
        let started = Instant::now();
        render_selection(&options, &selection, output);
        planned.apply()?;
        render(&mut planned, &options, output, started, installer, &root)?;
        Ok(Report { data: planned.report.clone(), code: 0, details: None })
    })
}

/// The installation's host, for an import that installs.
fn start_installer(
    root: &Path,
    options: &options::Options,
    argv: &[&str],
) -> io::Result<Option<installation::Installer>> {
    if !options.installs() {
        return Ok(None);
    }
    installation::Installer::start(root, argv).map(Some)
}

/// `listing remote components` per pattern, then `NoIdMatchWildcard` warnings.
fn render_selection(options: &options::Options, selection: &patterns::Selection, output: &Output) {
    if options.wildcards().is_empty() {
        return;
    }
    output.status("importing components");
    for _ in options.wildcards() {
        output.status("listing remote components");
    }
    for warning in &selection.warnings {
        output.warning(warning);
    }
}

fn render(
    planned: &mut Planned,
    options: &options::Options,
    output: &Output,
    started: Instant,
    installer: Option<installation::Installer>,
    root: &Path,
) -> io::Result<()> {
    if let Some(groups) = planned.prepared["laneGroups"].as_array() {
        let counts = groups
            .iter()
            .map(Value::as_u64)
            .map(|value| value.map(|count| count as usize))
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| io::Error::other("native inbound lane groups"))?;
        planned.progress
            .as_ref()
            .ok_or_else(|| io::Error::other("native inbound progress"))?
            .render_lane_groups(output, &counts, started)?;
        return Ok(());
    }
    if let Some(progress) = &planned.progress {
        // The wildcard listing already printed the first `importing components`.
        if options.wildcards().is_empty() {
            progress.render_inbound(output, options.operation == "fetch", !options.ids.is_empty());
        } else {
            progress.render_inbound(output, false, false);
        }
    }
    if let Some(installer) = installer {
        let ids = planned.receipt.ids.clone();
        if let Err(error) = installer.install(root, options.skip_write_config_files, &ids) {
            output.failure(&format!("installation failed with the following error: {error}"));
            planned.report =
                planned.receipt.import_report(planned.chalk, Some(&error.to_string()))?;
        }
    }
    output.success("importing components", Some(started));
    if options.lanes
        && let Some(progress) = &planned.progress
    {
        progress.render_lane_fetch_tail(output);
    }
    Ok(())
}

/// The engine's prepared import and what it prints.
struct Planned {
    engine: Engine,
    prepared: Value,
    receipt: report::Receipt,
    report: String,
    progress: Option<Progress>,
    chalk: Chalk,
}

impl Planned {
    fn plan(
        root: &Path,
        options: &options::Options,
        ids: &[String],
        chalk: Chalk,
    ) -> io::Result<Self> {
        let (engine, prepared) = prepare(root, options, ids)?;
        if prepared["laneFetch"] == true && !options.lanes
            || prepared["laneFetch"] != true && options.lanes
        {
            return Err(io::Error::other("native inbound lane receipt"));
        }
        let receipt = report::validate(&prepared)?;
        validate_lane_groups(&prepared, options)?;
        let report = if options.operation == "fetch" {
            receipt.fetch_report(chalk)?
        } else {
            receipt.import_report(chalk, None)?
        };
        let rows = json!({ "bitmapCount": 0, "imports": prepared["progress"], "loads": [] });
        let progress = Progress::parse(Some(&rows))?;
        Ok(Self { engine, prepared, receipt, report, progress, chalk })
    }

    /// `commandInboundApply`: the publication must be the planned one.
    fn apply(&mut self) -> io::Result<()> {
        let request = json!({ "kind": "commandInboundApply", "token": self.prepared["token"] });
        let applied: Value = self.engine.request(&request)?;
        if applied.get("applied") != Some(&Value::Bool(true)) {
            return Err(io::Error::other("native inbound apply receipt"));
        }
        let published = report::validate(&applied)?;
        let same = applied["token"] == self.prepared["token"]
            && applied["laneFetch"] == self.prepared["laneFetch"]
            && applied["laneGroups"] == self.prepared["laneGroups"]
            && published.ids == self.receipt.ids
            && applied["importDetails"] == self.prepared["importDetails"];
        if !same {
            return Err(io::Error::other("native inbound publication changed"));
        }
        Ok(())
    }
}

fn validate_lane_groups(prepared: &Value, options: &options::Options) -> io::Result<()> {
    let Some(groups) = prepared.get("laneGroups") else {
        if options.lanes && options.ids.len() > 1 {
            return Err(io::Error::other("native inbound lane groups"));
        }
        return Ok(());
    };
    let rows = prepared["progress"]
        .as_array()
        .ok_or_else(|| io::Error::other("native inbound progress"))?;
    let counts = groups.as_array().ok_or_else(|| io::Error::other("native inbound lane groups"))?;
    if !options.lanes
        || counts.len() != options.ids.len()
        || counts.len() < 2
        || counts.len() > 32
        || counts
            .iter()
            .any(|count| {
                count
                    .as_u64()
                    .is_none_or(|count| count == 0)
            })
        || counts
            .iter()
            .filter_map(Value::as_u64)
            .sum::<u64>()
            != rows.len() as u64
    {
        return Err(io::Error::other("native inbound lane groups"));
    }
    Ok(())
}

/// `commandInboundPrepare`: the engine fetches, and plans the writes.
fn prepare(root: &Path, options: &options::Options, ids: &[String]) -> io::Result<(Engine, Value)> {
    let mut engine = Engine::new()?;
    let prepared = prepare_into(&mut engine, root, options, ids)?;
    Ok((engine, prepared))
}

/// Retain a main-component refresh for `status --lanes` until its complete
/// report has passed preflight. The same inbound transfer serves `bit fetch`.
pub(super) fn prepare_status_refresh(
    engine: &mut Engine,
    root: &Path,
    ids: &[String],
) -> io::Result<Value> {
    let options = options::Options {
        operation: "status",
        ids: Vec::new(),
        objects_only: true,
        all_history: true,
        write: options::WriteOptions {
            skip_dependency_installation: false,
            override_existing: false,
            path: None,
        },
        lanes: false,
        skip_write_config_files: false,
        include_deprecated: false,
    };
    prepare_into(engine, root, &options, ids)
}

pub(super) fn prepare_status_forked_refresh(
    engine: &mut Engine,
    root: &Path,
    lane: &str,
) -> io::Result<Value> {
    let options = options::Options {
        operation: "status",
        ids: Vec::new(),
        objects_only: true,
        all_history: false,
        write: options::WriteOptions {
            skip_dependency_installation: false,
            override_existing: false,
            path: None,
        },
        lanes: true,
        skip_write_config_files: false,
        include_deprecated: false,
    };
    prepare_into(engine, root, &options, &[lane.to_owned()])
}

pub(super) fn apply_status_refresh(engine: &mut Engine, token: &Value) -> io::Result<()> {
    let applied: Value = engine.request(&json!({"kind":"commandInboundApply","token":token}))?;
    if applied["applied"] != true || applied["token"] != *token {
        return Err(io::Error::other("status main refresh publication"));
    }
    Ok(())
}

fn prepare_into(
    engine: &mut Engine,
    root: &Path,
    options: &options::Options,
    ids: &[String],
) -> io::Result<Value> {
    let cli = NodeCli::find()?;
    let config = cache_root().join("config");
    let mut request = json!({
        "kind": "commandInboundPrepare",
        "root": root,
        "home": workspace_command::home(),
        "globalRemotesFile": config.join("global-remotes.json"),
        "globalConfigDir": config,
        "nodeExecutable": cli.node,
        "bitDir": cli.bit_dir,
        "bitVersion": cli.version,
        "operation": options.operation,
        "ids": ids,
        "options": options.request(),
    });
    if !options.objects_only {
        request["bitmapHistoryFileId"] = json!(workspace_command::file_id());
    }
    engine.request(&request)
}
