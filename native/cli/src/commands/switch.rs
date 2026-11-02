//! Native `bit switch <lane>` ([`COMMAND`]) through the workspace
//! command's prepare, plan, capture and apply lifecycle.
//!
//! Coordinates [`installation`], [`options`], [`report`], and [`run`] and re-exports [`import_options`].

pub(super) use options::parse_import as import_options;
mod installation;
mod options;
mod report;
#[cfg(test)]
mod tests;

use super::{
    color::Chalk,
    installation::Installer,
    status::js::{array, decline, text},
    workspace_command::{
        self, Planned, Request, format::Formatter, progress::Progress, results::Report,
    },
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use serde_json::Value;
use std::{env, ffi::OsString, io, path::Path};

/// Descriptor for the native `bit switch` command ([`COMMAND`]).
pub const COMMAND: Command = Command { name: "switch", aliases: &[], run };
/// Entry point for `bit switch`.
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native switch grammar".to_string()));
    };
    run_options(args, &argv, &options, false)
}
/// Entry point for `bit lane import <lane>` sharing the switch execution pipeline.
#[inline]
pub(super) fn lane_import(args: &[OsString], argv: &[&str]) -> io::Result<Outcome> {
    let Some(options) = options::parse_import(&argv[2..]) else {
        return Ok(Outcome::Declined("outside the native lane import grammar".into()));
    };
    run_options(args, argv, &options, true)
}

fn run_options(
    args: &[OsString],
    argv: &[&str],
    options: &options::Options,
    lane_import: bool,
) -> io::Result<Outcome> {
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return outside_workspace_switch(&cwd, args, options, lane_import);
    };
    if let Some(outcome) = preflight_switch_error(&root, args, options, lane_import) {
        return outcome;
    }
    if !options.supported_pattern() || options.adoption.json {
        return Ok(Outcome::Declined(
            "switch requires an unsupported selector or JSON handler".into(),
        ));
    }
    run_workspace(&root, args, argv, options, lane_import)
}

fn run_workspace(
    root: &Path,
    args: &[OsString],
    argv: &[&str],
    options: &options::Options,
    lane_import: bool,
) -> io::Result<Outcome> {
    let installer = match (!options.skip_install).then(|| Installer::start(root, argv)).transpose()
    {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("switch installation: {error}"))),
    };
    let (environment, installation) = installation_session(installer)?;
    let mut startup = super::status::autosync::Startup::default();
    let prepared = match prepare(root, args, options, &mut startup, environment) {
        Ok(prepared) => prepared,
        Err(error) if startup.committed || super::engine::is_canonical(&error) => {
            return workspace_command::checkout_lifecycle::failure(
                root,
                args,
                if lane_import { "import" } else { "switch" },
                &startup,
                error,
            );
        }
        Err(error) => return Ok(Outcome::Declined(format!("switch: {error}"))),
    };
    execute(root, args, prepared, installation, lane_import)
}

fn outside_workspace_switch(
    cwd: &Path,
    args: &[OsString],
    options: &options::Options,
    lane_import: bool,
) -> io::Result<Outcome> {
    if super::scope_rename::ci_active() {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    }
    let msg = if lane_import && options.force_ours && options.force_theirs {
        "please use either --force-ours or --force-theirs, not both"
    } else {
        super::log::OUTSIDE_WORKSPACE_ERR
    };
    let cmd = if lane_import { "import" } else { "switch" };
    workspace_command::execute_failure_scope(cwd, args, cmd, false, "", io::Error::other(msg))
}

fn preflight_switch_error(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
    lane_import: bool,
) -> Option<io::Result<Outcome>> {
    if super::scope_rename::ci_active() || Installer::needs_canonical(root) {
        return None;
    }
    let msg = options.preflight_error(lane_import)?;
    let cmd = if lane_import { "import" } else { "switch" };
    let err = io::Error::other(msg);
    if options.adoption.json {
        return Some(workspace_command::execute_json(root, args, cmd, |_| Err(err)));
    }
    Some(workspace_command::execute_then(root, args, cmd, |_| Err(err)))
}

#[inline]
fn installation_session(
    installer: Option<Installer>,
) -> io::Result<(Option<super::status::environments::Environments>, Option<bit_install::HostInfo>)>
{
    match installer {
        Some(installer) => {
            let (environment, info) = installer.into_parts()?;
            Ok((Some(environment), Some(info)))
        }
        None => Ok((None, None)),
    }
}

#[inline]
fn execute(
    root: &Path,
    args: &[OsString],
    prepared: PreparedSwitch,
    installation: Option<bit_install::HostInfo>,
    lane_import: bool,
) -> io::Result<Outcome> {
    workspace_command::checkout_lifecycle::before(&prepared.startup)?;
    let command = if lane_import { "import" } else { "switch" };
    workspace_command::execute_then(root, args, command, |output| {
        install_and_report(root, args, output, prepared, installation)
    })
}

fn install_and_report(
    root: &Path,
    args: &[OsString],
    output: &Output,
    mut prepared: PreparedSwitch,
    installation: Option<bit_install::HostInfo>,
) -> io::Result<Report> {
    render_progress(output, &prepared);
    let applied = workspace_command::switch::apply(&mut prepared.planned, root)?;
    if !prepared.install_ids.is_empty()
        && prepared.planned.plan["result"]["leftUnresolvedConflicts"] != true
        && let Some(info) = installation
    {
        let errors = installation::run(
            root,
            &mut prepared.planned,
            info,
            &prepared.install_ids,
            output,
            Chalk::detect(args),
        )?;
        let mut sections = vec![prepared.report.data];
        sections.extend(errors);
        prepared.report.data = Formatter::join(&sections);
    }
    workspace_command::switch::complete(&mut prepared.planned, &applied)?;
    for warning in &prepared.warnings {
        output.warning(warning);
    }
    Ok(prepared.report)
}

fn render_progress(output: &Output, prepared: &PreparedSwitch) {
    output.status("switching lanes");
    let count = prepared_import_count(&prepared.startup);
    for import in prepared.imports
        .iter()
        .take(count)
        .filter(|import| import.requested > 0)
    {
        import.render(output);
    }
    if let Some(warning) = prepared.startup.build_progress
        .as_ref()
        .and_then(|progress| progress["switchRemoteWarning"].as_str())
        .map(str::trim)
        .filter(|warning| !warning.is_empty())
    {
        output.warning(warning);
    }
    workspace_command::checkout_lifecycle::loaded(&prepared.startup);
    for import in prepared.imports
        .iter()
        .skip(count)
        .filter(|import| import.requested > 0)
    {
        import.render(output);
    }
    if let Some(checkout) = &prepared.checkout_import {
        checkout.render(output);
    }
}

#[inline]
fn prepared_import_count(startup: &super::status::autosync::Startup) -> usize {
    startup.build_progress
        .as_ref()
        .and_then(|value| value["imports"].as_array())
        .map_or(0, Vec::len)
}

struct PreparedSwitch {
    startup: super::status::autosync::Startup,
    planned: Planned,
    report: Report,
    checkout_import: Option<RemoteImport>,
    imports: Vec<RemoteImport>,
    install_ids: Vec<String>,
    warnings: Vec<String>,
}

fn prepare(
    root: &std::path::Path,
    args: &[OsString],
    options: &options::Options,
    startup: &mut super::status::autosync::Startup,
    environment: Option<super::status::environments::Environments>,
) -> io::Result<PreparedSwitch> {
    let request =
        Request { operation: "switch", options: options.request(), to: None, verify_fresh: false };
    let planned = match environment {
        Some(env) => workspace_command::plan_with_environment(root, &request, startup, env)?,
        None => workspace_command::plan_with_startup(root, &request, startup)?,
    };
    let chalk = super::color::Chalk::detect(args);
    let report = report::format(&planned.plan["result"], options, chalk)?;
    let checkout_import = checkout_import(&planned.plan["switchCheckoutImport"])?;
    let imports = remote_imports(planned.plan.get("progress"))?;
    let install_ids = writer_ids(&planned.plan)?;
    Ok(PreparedSwitch {
        startup: std::mem::take(startup),
        planned,
        report,
        checkout_import,
        imports,
        install_ids,
        warnings: options.warnings(),
    })
}

fn writer_ids(plan: &Value) -> io::Result<Vec<String>> {
    let rows =
        plan["switchWriterIds"].as_array().ok_or_else(|| decline("switch writer identities"))?;
    if rows.len() > 8192 {
        return Err(decline("switch writer identity count"));
    }
    rows.iter()
        .filter_map(|id| match text(Some(id)) {
            Ok(val) => {
                let trimmed = val.trim();
                (!trimmed.is_empty()).then(|| Ok(trimmed.to_owned()))
            }
            Err(error) => Some(Err(error)),
        })
        .collect()
}

struct RemoteImport {
    requested: usize,
    components: u64,
    objects: u64,
    reason: Option<String>,
}

fn checkout_import(receipt: &Value) -> io::Result<Option<RemoteImport>> {
    let requested = receipt["requested"]
        .as_u64()
        .filter(|count| *count <= 8192)
        .ok_or_else(|| decline("switch checkout import count"))?;
    let performed =
        receipt["performed"].as_bool().ok_or_else(|| decline("switch checkout import phase"))?;
    if performed != (requested > 0) {
        return Err(decline("switch checkout import phase count"));
    }
    let components = receipt["components"]
        .as_u64()
        .filter(|count| *count <= 16384)
        .ok_or_else(|| decline("switch checkout import component count"))?;
    let objects = receipt["objects"]
        .as_u64()
        .filter(|count| *count <= 16384)
        .ok_or_else(|| decline("switch checkout import object count"))?;
    Ok(performed.then_some(RemoteImport {
        requested: usize::try_from(requested).map_err(io::Error::other)?,
        components,
        objects,
        reason: None,
    }))
}

fn remote_imports(value: Option<&Value>) -> io::Result<Vec<RemoteImport>> {
    Progress::parse(value)?.ok_or_else(|| decline("native switch remote progress receipt"))?;
    let rows = array(value.and_then(|value| value.get("imports")), "switch remote imports")?;
    if rows.len() > 4 {
        return Err(decline("native switch remote imports"));
    }
    rows.iter()
        .map(RemoteImport::parse)
        .collect()
}

impl RemoteImport {
    fn parse(value: &Value) -> io::Result<Self> {
        let ids = array(value.get("ids"), "switch import ids")?;
        let requested = ids.len();
        let components =
            value["components"].as_u64().ok_or_else(|| decline("switch import components"))?;
        let objects = value["objects"].as_u64().ok_or_else(|| decline("switch import objects"))?;
        let reason = match super::status::js::nullish(value.get("reason")) {
            None => None,
            Some(other) => Some(text(Some(other))?.trim().to_string()),
        };
        if reason
            .as_deref()
            .is_some_and(|reason| {
                reason
                    .strip_prefix("for fetching lane ")
                    .is_none_or(|lane| lane.trim().is_empty())
            })
        {
            return Err(decline("native switch remote import reason"));
        }
        Ok(Self { requested, components, objects, reason })
    }

    fn render(&self, output: &Output) {
        let suffix = self.reason
            .as_ref()
            .map_or_else(String::new, |reason| format!(" {reason}"));
        output.restart(&format!("importing {} components{suffix}", self.requested));
        let (count, kind) = if self.components > 0 {
            (self.components, "components")
        } else {
            (self.objects, "objects")
        };
        output.restart(&format!("successfully imported {count} {kind}{suffix}"));
    }
}

/// Render a prepared switch prefix when callback capture or planning failed.
pub(super) fn render_failure_progress(
    output: &Output,
    startup: &super::status::autosync::Startup,
    failed_output: &str,
) -> io::Result<()> {
    let imports = remote_imports(startup.build_progress.as_ref())?;
    output.status("switching lanes");
    for import in &imports {
        if import.requested > 0 {
            import.render(output);
        }
    }
    workspace_command::checkout_lifecycle::loaded(startup);
    print!("{failed_output}");
    if failed_output.is_empty()
        && let Some(receipt) = startup.build_progress
            .as_ref()
            .and_then(|value| value.get("switchCheckoutImport"))
        && let Some(import) = checkout_import(receipt)?
    {
        import.render(output);
    }
    Ok(())
}
