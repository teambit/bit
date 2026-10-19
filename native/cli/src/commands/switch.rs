//! Native `bit switch <lane>` through the workspace
//! command's prepare, plan, capture and apply lifecycle.

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

pub const COMMAND: Command = Command { name: "switch", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native switch grammar".to_string()));
    };
    run_options(args, &argv, &options, false)
}

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
    if !options.supported_pattern() || options.adoption.json {
        return Ok(Outcome::Declined(
            "switch requires an unsupported selector or JSON handler".into(),
        ));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let installer = match start_installer(&root, argv, options.skip_install) {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("switch installation: {error}"))),
    };
    let (environment, installation) = installation_session(installer)?;
    let mut startup = super::status::autosync::Startup::default();
    let prepared = match prepare(&root, args, options, &mut startup, environment) {
        Ok(prepared) => prepared,
        Err(error) if startup.committed || super::engine::is_canonical(&error) => {
            return workspace_command::checkout_lifecycle::failure(
                &root,
                args,
                if lane_import { "import" } else { "switch" },
                &startup,
                error,
            );
        }
        Err(error) => return Ok(Outcome::Declined(format!("switch: {error}"))),
    };
    execute(&root, args, prepared, installation, lane_import)
}

fn start_installer(root: &Path, argv: &[&str], skip: bool) -> io::Result<Option<Installer>> {
    if skip { Ok(None) } else { Installer::start(root, argv).map(Some) }
}

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
    render_progress(
        output,
        &prepared.imports,
        prepared.checkout_import.as_ref(),
        &prepared.startup,
    );
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

fn render_progress(
    output: &Output,
    imports: &[RemoteImport],
    checkout: Option<&RemoteImport>,
    startup: &super::status::autosync::Startup,
) {
    output.status("switching lanes");
    let prepared = prepared_import_count(startup);
    for import in imports.iter().take(prepared) {
        if import.requested > 0 {
            import.render(output);
        }
    }
    workspace_command::checkout_lifecycle::loaded(startup);
    for import in imports.iter().skip(prepared) {
        if import.requested > 0 {
            import.render(output);
        }
    }
    if let Some(checkout) = checkout {
        checkout.render(output);
    }
}

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
        Some(environment) => {
            workspace_command::plan_with_environment(root, &request, startup, environment)?
        }
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
        warnings: warnings(options),
    })
}

fn writer_ids(plan: &Value) -> io::Result<Vec<String>> {
    let rows = plan
        .get("switchWriterIds")
        .and_then(Value::as_array)
        .ok_or_else(|| decline("switch writer identities"))?;
    if rows.len() > 8192 {
        return Err(decline("switch writer identity count"));
    }
    rows.iter()
        .map(|id| text(Some(id)).map(str::to_owned))
        .collect()
}

fn warnings(options: &options::Options) -> Vec<String> {
    [(options.adoption.get_all, "get-all"), (options.adoption.head, "head")]
        .into_iter()
        .filter(|(enabled, _)| *enabled)
        .map(|(_, name)| {
            format!("the --{name} flag is deprecated and currently the default behavior")
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
        let components = value
            .get("components")
            .and_then(Value::as_u64)
            .ok_or_else(|| decline("switch import components"))?;
        let objects = value
            .get("objects")
            .and_then(Value::as_u64)
            .ok_or_else(|| decline("switch import objects"))?;
        let reason = match value.get("reason") {
            Some(Value::Null) => None,
            other => Some(text(other)?.to_string()),
        };
        if reason
            .as_deref()
            .is_some_and(|reason| !reason.starts_with("for fetching lane "))
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
