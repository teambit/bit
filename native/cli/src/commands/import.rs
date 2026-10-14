//! Native `bit import` and `bit fetch` for the forms that only bring
//! objects (`fetch -c`, `import -o`, `import` without ids) or write the
//! components without installing (`import <ids> -x`): the engine fetches,
//! writes and reports (`commandInbound*`).

mod options;
mod report;

use super::{
    color::Chalk,
    engine::Engine,
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
    let mut planned = match Planned::plan(&root, &options, Chalk::detect(args)) {
        Ok(planned) => planned,
        Err(error) => return Ok(Outcome::Declined(format!("{}: {error}", options.operation))),
    };
    let report = Report { data: planned.report.clone(), code: 0, details: None };
    workspace_command::execute_with(&root, args, options.operation, &report, |output| {
        let started = Instant::now();
        planned.apply()?;
        render(&planned, &options, output, started)
    })
}

fn render(
    planned: &Planned,
    options: &options::Options,
    output: &Output,
    started: Instant,
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
        progress.render_inbound(output, options.operation == "fetch", !options.ids.is_empty());
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
}

impl Planned {
    fn plan(root: &Path, options: &options::Options, chalk: Chalk) -> io::Result<Self> {
        let (engine, prepared) = prepare(root, options)?;
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
            receipt.import_report(chalk)?
        };
        let rows = json!({ "bitmapCount": 0, "imports": prepared["progress"], "loads": [] });
        let progress = Progress::parse(Some(&rows))?;
        Ok(Self { engine, prepared, receipt, report, progress })
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
fn prepare(root: &Path, options: &options::Options) -> io::Result<(Engine, Value)> {
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
        "ids": options.ids,
        "options": options.request(),
    });
    if !options.objects_only {
        request["bitmapHistoryFileId"] = json!(workspace_command::file_id());
    }
    let mut engine = Engine::new()?;
    let prepared: Value = engine.request(&request)?;
    Ok((engine, prepared))
}
