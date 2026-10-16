//! Native `bit switch <lane>` through the workspace
//! command's prepare, plan, capture and apply lifecycle.

mod options;
mod report;
#[cfg(test)]
mod tests;

use super::{
    color::Chalk,
    installation::{self, Installer},
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
    let Some(options) = options::parse(&argv[2..]) else {
        return Ok(Outcome::Declined("outside the native lane import grammar".into()));
    };
    if options.skip_fetch || options.verbose {
        return Ok(Outcome::Declined("outside the native lane import grammar".into()));
    }
    run_options(args, argv, &options, true)
}

fn run_options(
    args: &[OsString],
    argv: &[&str],
    options: &options::Options,
    lane_import: bool,
) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let installer = match start_installer(&root, argv, options.skip_install) {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("switch installation: {error}"))),
    };
    let mut startup = super::status::autosync::Startup::default();
    let prepared = match prepare(&root, args, options, &mut startup) {
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
    execute(&root, args, prepared, installer, lane_import)
}

fn start_installer(root: &Path, argv: &[&str], skip: bool) -> io::Result<Option<Installer>> {
    if skip { Ok(None) } else { Installer::start(root, argv).map(Some) }
}

fn execute(
    root: &Path,
    args: &[OsString],
    prepared: PreparedSwitch,
    installer: Option<Installer>,
    lane_import: bool,
) -> io::Result<Outcome> {
    workspace_command::checkout_lifecycle::before(&prepared.startup)?;
    let needs_checkout_progress = !prepared.checkout_import_present(lane_import);
    let command = if lane_import { "import" } else { "switch" };
    if let Some(installer) = installer {
        return workspace_command::execute_then(root, args, command, |output| {
            install_and_report(
                root,
                args,
                output,
                prepared,
                needs_checkout_progress,
                installer,
                lane_import,
            )
        });
    }
    workspace_command::execute(root, args, command, prepared.planned, &prepared.report, |output| {
        render_progress(
            output,
            &prepared.imports,
            needs_checkout_progress,
            prepared.import_count,
            lane_import,
            &prepared.startup,
        );
    })
}

fn install_and_report(
    root: &Path,
    args: &[OsString],
    output: &Output,
    mut prepared: PreparedSwitch,
    checkout_progress: bool,
    installer: Installer,
    lane_import: bool,
) -> io::Result<Report> {
    render_progress(
        output,
        &prepared.imports,
        checkout_progress,
        prepared.import_count,
        lane_import,
        &prepared.startup,
    );
    workspace_command::commit(&mut prepared.planned, root)?;
    if !prepared.install_ids.is_empty()
        && let Err(error) = installer.install(root, false, &prepared.install_ids)
    {
        output.failure(&format!("installation failed with the following error: {error}"));
        let formatter = Formatter::new(Chalk::detect(args));
        prepared.report.data = Formatter::join(&[
            prepared.report.data,
            installation::error_report(formatter.chalk, &error.to_string()),
        ]);
    }
    Ok(prepared.report)
}

fn render_progress(
    output: &Output,
    imports: &[RemoteImport],
    checkout: bool,
    count: u64,
    lane_import: bool,
    startup: &super::status::autosync::Startup,
) {
    if lane_import || !startup.build_stdout.is_empty() {
        output.restart("switching lanes");
    }
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
    if checkout {
        render_import(output, count);
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
    import_count: u64,
    imports: Vec<RemoteImport>,
    install_ids: Vec<String>,
}

impl PreparedSwitch {
    fn checkout_import_present(&self, lane_import: bool) -> bool {
        !lane_import && self.imports.iter().any(|row| row.reason.is_some())
            || self.imports.len() > prepared_import_count(&self.startup)
                && self.imports
                    .last()
                    .is_some_and(|row| row.requested > 0)
    }
}

fn prepare(
    root: &std::path::Path,
    args: &[OsString],
    options: &options::Options,
    startup: &mut super::status::autosync::Startup,
) -> io::Result<PreparedSwitch> {
    let request =
        Request { operation: "switch", options: options.request(), to: None, verify_fresh: false };
    let planned = workspace_command::plan_with_startup(root, &request, startup)?;
    let chalk = super::color::Chalk::detect(args);
    let report = report::format(&planned.plan["result"], options, chalk)?;
    let import_count = planned.plan["switchImportCount"]
        .as_u64()
        .filter(|count| *count <= 4096)
        .ok_or_else(|| io::Error::other("native switch import progress receipt"))?;
    let mut imports = remote_imports(planned.plan.get("progress"))?;
    if imports.iter().any(|import| import.reason.is_some())
        && let Some(checkout) = imports.last_mut()
        && checkout.reason.is_none()
        && checkout.requested > 0
    {
        checkout.requested =
            usize::try_from(import_count).map_err(|_| decline("switch fetched checkout count"))?;
        checkout.components = import_count;
        checkout.objects = 0;
    }
    let install_ids = installation::component_ids(&planned.plan["result"])?;
    Ok(PreparedSwitch {
        startup: std::mem::take(startup),
        planned,
        report,
        import_count,
        imports,
        install_ids,
    })
}

struct RemoteImport {
    requested: usize,
    components: u64,
    objects: u64,
    reason: Option<String>,
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

fn render_import(output: &Output, count: u64) {
    output.restart(&format!("importing {count} components"));
    output.restart(&format!("successfully imported {count} components"));
}

/// Render a prepared switch prefix when callback capture or planning failed.
pub(super) fn render_failure_progress(
    output: &Output,
    startup: &super::status::autosync::Startup,
    failed_output: &str,
) -> io::Result<()> {
    let imports = remote_imports(startup.build_progress.as_ref())?;
    output.restart("switching lanes");
    for import in &imports {
        if import.requested > 0 {
            import.render(output);
        }
    }
    workspace_command::checkout_lifecycle::loaded(startup);
    print!("{failed_output}");
    if failed_output.is_empty() {
        let count = startup.build_progress
            .as_ref()
            .and_then(|value| value["switchImportCount"].as_u64())
            .ok_or_else(|| decline("switch prepared checkout count"))?;
        render_import(output, count);
    }
    Ok(())
}
