//! Native `bit import` and `bit fetch`: the engine fetches, writes and
//! reports (`commandInbound*`). Wildcard patterns are listed on their remotes
//! first, and an import that writes components installs them afterwards
//! unless `-x` is given.

pub(in crate::commands) use recover::{
    RecoverOptions, recover_import, recover_probe, recover_scope_import,
};

mod cache;
mod execution;
mod lifecycle;
mod options;
mod output;
mod patterns;
mod preparation;
mod recover;
mod report;
mod stages;

use super::{
    color::Chalk,
    engine::Engine,
    installation,
    workspace_command::{self, progress::Progress},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use preparation::{prepare_into, prepare_into_with};
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, path::Path, time::Instant};

pub const IMPORT: Command = Command { name: "import", aliases: &[], run };
pub const FETCH: Command = Command { name: "fetch", aliases: &[], run };

pub(in crate::commands) fn lane_fetch(
    root: &Path,
    args: &[OsString],
    fetch_argv: &[&str],
) -> io::Result<Outcome> {
    let Some(options) = options::parse(fetch_argv) else {
        return Ok(Outcome::Declined("outside the native lane fetch grammar".to_string()));
    };
    execution::run(root, args, &options)
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv) else {
        return Ok(Outcome::Declined("outside the native import grammar".to_string()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if options.operation == "import"
            && !(options.output.json && options.ids.is_empty())
            && env::var_os("CI").is_none_or(|val| val.is_empty())
        {
            let msg = options
                .validation_error()
                .unwrap_or_else(|| super::log::OUTSIDE_WORKSPACE_ERR.to_owned());
            return workspace_command::execute_failure_scope(
                &cwd,
                args,
                "import",
                options.output.json,
                "",
                io::Error::other(msg),
            );
        }
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    execution::run(&root, args, &options)
}

fn render(
    planned: &mut Planned,
    options: &options::Options,
    output: &Output,
    started: Instant,
    installer: Option<installation::Installer>,
    root: &Path,
) -> io::Result<()> {
    render_with_progress(planned, options, output, started, installer, root, false)
}
fn render_with_progress(
    planned: &mut Planned,
    options: &options::Options,
    output: &Output,
    started: Instant,
    installer: Option<installation::Installer>,
    root: &Path,
    progress_done: bool,
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
            .render_fetch_groups(output, &counts, planned.prepared["mainFetch"] == true, started)?;
        return Ok(());
    }
    if !progress_done {
        render_progress(planned, options, output);
    }
    if let Some(installer) = installer {
        render_installation(planned, options, output, installer, root)?;
    }
    output.success("importing components", Some(started));
    if options.lanes
        && let Some(progress) = &planned.progress
    {
        progress.render_lane_fetch_tail(output);
    }
    Ok(())
}

fn render_installation(
    planned: &mut Planned,
    options: &options::Options,
    output: &Output,
    installer: installation::Installer,
    root: &Path,
) -> io::Result<()> {
    let ids = planned.receipt.ids.clone();
    let order = lifecycle::component_order(&planned.prepared)?;
    let errors =
        installer.install_import(root, options.write.skip_write_config_files, &ids, &order)?;
    if let Some(error) = &errors.installation
        && !errors.installation_reported
    {
        output.failure(&format!("installation failed with the following error: {error}"));
    }
    if errors.installation.is_some() || errors.compilation.is_some() {
        planned.report = if options.output.json {
            output::json_report(
                &planned.prepared,
                errors.installation.is_some(),
                errors.compilation.is_some(),
            )?
        } else {
            planned.receipt.import_report_with_errors(
                planned.chalk,
                errors.installation.as_deref(),
                errors.compilation.as_deref(),
            )?
        };
    }
    Ok(())
}

fn render_progress(planned: &Planned, options: &options::Options, output: &Output) {
    if let Some(progress) = &planned.progress {
        if planned.graph_progress {
            progress.render_inbound_continuation(
                output,
                planned.prepared["currentLane"].is_string(),
            );
            return;
        }
        // The wildcard listing already printed the first `importing components`.
        if options.wildcards().is_empty() {
            progress.render_inbound(
                output,
                options.operation == "fetch",
                !options.ids.is_empty() || planned.prepared["laneObjectImport"] == true,
                options.write.dependencies.depth.is_some()
                    && (options.write.dependencies.import_head_dependencies
                        || options.ids
                            .iter()
                            .any(|id| !id.contains('@'))),
                options.write.dependencies.depth.map(|_| planned.prefetch_count),
                planned.prepared["currentLane"].is_string(),
            );
        } else {
            progress.render_inbound(
                output,
                false,
                false,
                true,
                options.write.dependencies.depth.map(|_| planned.prefetch_count),
                planned.prepared["currentLane"].is_string(),
            );
        }
    }
}

/// The engine's prepared import and what it prints.
struct Planned {
    engine: Engine,
    prepared: Value,
    receipt: report::Receipt,
    report: String,
    progress: Option<Progress>,
    chalk: Chalk,
    prefetch_count: usize,
    graph_progress: bool,
}

impl Planned {
    fn plan(
        root: &Path,
        options: &options::Options,
        ids: &[String],
        chalk: Chalk,
    ) -> io::Result<Self> {
        Self::plan_with(root, options, ids, chalk, false)
    }
    fn plan_with(
        root: &Path,
        options: &options::Options,
        ids: &[String],
        chalk: Chalk,
        recovery: bool,
    ) -> io::Result<Self> {
        let mut engine = Engine::new()?;
        let prepared = prepare_into_with(&mut engine, root, options, ids, recovery)?;
        Self::from_prepared(engine, prepared, options, ids, chalk, false)
    }
    fn from_prepared(
        mut engine: Engine,
        mut prepared: Value,
        options: &options::Options,
        ids: &[String],
        chalk: Chalk,
        graph_progress: bool,
    ) -> io::Result<Self> {
        if let Some(receipt) = prepared.get("checkoutPolicyPreparation") {
            let semver = workspace_command::checkout_policy::semver(receipt)?;
            prepared = engine.request(&json!({"kind":"commandInboundPolicyComplete",
                "token":prepared["token"],"semver":semver}))?;
        }
        if prepared["laneFetch"] == true && !options.lanes
            || prepared["laneFetch"] != true && options.lanes
        {
            return Err(io::Error::other("native inbound lane receipt"));
        }
        let receipt = report::validate(&prepared)?;
        output::validate_lane_groups(&prepared, options)?;
        let report = if options.output.json {
            output::json_report(&prepared, false, false)?
        } else if options.operation == "fetch" {
            receipt.fetch_report(chalk)?
        } else {
            receipt.import_report(chalk, None)?
        };
        let rows = json!({ "bitmapCount": 0, "imports": prepared["progress"], "loads": [] });
        let progress = Progress::parse(Some(&rows))?;
        Ok(Self {
            engine,
            prepared,
            receipt,
            report,
            progress,
            chalk,
            prefetch_count: ids.len(),
            graph_progress,
        })
    }

    /// `commandInboundApply`: the publication must be the planned one.
    fn apply(&mut self) -> io::Result<Value> {
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
        Ok(applied)
    }
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
            skip_write_config_files: false,
            skip_dependency_installation: false,
            override_existing: false,
            merge: false,
            path: None,
            merge_strategy: None,
            dependencies: options::DependencyOptions::default(),
            adoption: options::AdoptionOptions::default(),
        },
        lanes: false,
        output: options::OutputOptions::default(),
        selection: options::SelectionOptions::default(),
    };
    prepare_into(engine, root, &options, ids)
}

pub(super) fn prepare_diff_refresh(
    engine: &mut Engine,
    root: &Path,
    ids: &[String],
) -> io::Result<Value> {
    let options = options::Options {
        operation: "diff",
        ids: Vec::new(),
        objects_only: true,
        all_history: false,
        write: options::WriteOptions {
            skip_write_config_files: false,
            skip_dependency_installation: false,
            override_existing: false,
            merge: false,
            path: None,
            merge_strategy: None,
            dependencies: options::DependencyOptions::default(),
            adoption: options::AdoptionOptions::default(),
        },
        lanes: false,
        output: options::OutputOptions::default(),
        selection: options::SelectionOptions::default(),
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
            skip_write_config_files: false,
            skip_dependency_installation: false,
            override_existing: false,
            merge: false,
            path: None,
            merge_strategy: None,
            dependencies: options::DependencyOptions::default(),
            adoption: options::AdoptionOptions::default(),
        },
        lanes: true,
        output: options::OutputOptions::default(),
        selection: options::SelectionOptions::default(),
    };
    prepare_into(engine, root, &options, &[lane.to_owned()])
}

/// Fetch and publish one remote Lane without materializing workspace files.
pub(super) fn prepare_lane_import(
    engine: &mut Engine,
    root: &Path,
    lane: &str,
) -> io::Result<Value> {
    let options = options::Options {
        operation: "laneImport",
        ids: Vec::new(),
        objects_only: true,
        all_history: false,
        write: options::WriteOptions {
            skip_write_config_files: false,
            skip_dependency_installation: false,
            override_existing: false,
            merge: false,
            path: None,
            merge_strategy: None,
            dependencies: options::DependencyOptions::default(),
            adoption: options::AdoptionOptions::default(),
        },
        lanes: true,
        output: options::OutputOptions::default(),
        selection: options::SelectionOptions::default(),
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
