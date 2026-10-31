//! Native component and lane merge abort through the workspace recovery plan.
//! All validation and file restoration stay in the Rust workspace engine.
mod failure;
mod interactive;
mod report;
#[cfg(test)]
mod tests;

use super::{
    add::ProjectedLinker,
    checkout,
    color::Chalk,
    engine::Engine,
    ids::Id,
    installation::{self, Installer},
    status::{
        autosync::Startup,
        cache,
        capture::{self, Capture},
        environments,
        fresh::dependency_grammar,
        grammar,
        js::{array, decline, object, text},
    },
    workspace_command::{self, format::Formatter, progress::Progress, results::Report},
};
use crate::native::Outcome;
use bit_install::{HostInfo, output::Output};
use report::{
    consume_trailing_recovery, format_result, install_ids, installation_session,
    prepare_recovery_context, prepare_request, read_environment, valid_pattern,
};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path, sync::Arc};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Component,
    Lane,
}

pub(super) struct Options {
    kind: Kind,
    pattern: Option<String>,
    skip_install: bool,
    verbose: bool,
    silent: bool,
}

pub(super) fn parse_component(args: &[&str]) -> Option<Options> {
    parse(args, Kind::Component)
}
pub(super) fn parse_lane(args: &[&str]) -> Option<Options> {
    parse(args, Kind::Lane)
}

fn parse(args: &[&str], kind: Kind) -> Option<Options> {
    let mut opts =
        Options { kind, pattern: None, skip_install: false, verbose: false, silent: false };
    let mut abort = false;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            consume_trailing_recovery(iter, kind, &mut opts.pattern)?;
            break;
        }
        apply_recovery_flag(arg, &mut opts, &mut abort)?;
    }
    (kind != Kind::Component || abort).then_some(opts)
}

fn apply_recovery_flag(arg: &str, opts: &mut Options, abort: &mut bool) -> Option<()> {
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" => Some(()),
        "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true"
            if !opts.skip_install =>
        {
            opts.skip_install = true;
            Some(())
        }
        "--skip-dependency-installation=false" if !opts.skip_install => Some(()),
        "--verbose" | "--verbose=true" if !opts.verbose => {
            opts.verbose = true;
            Some(())
        }
        "--verbose=false" if !opts.verbose => Some(()),
        _ if opts.kind == Kind::Component => apply_component_flag(arg, opts, abort),
        _ => apply_lane_flag(arg, opts),
    }
}

fn apply_component_flag(arg: &str, opts: &mut Options, abort: &mut bool) -> Option<()> {
    if matches!(arg, "--abort" | "--abort=true") && !*abort {
        *abort = true;
        return Some(());
    }
    (opts.pattern.is_none() && valid_pattern(arg)).then(|| opts.pattern = Some(arg.to_string()))
}

fn apply_lane_flag(arg: &str, opts: &mut Options) -> Option<()> {
    if opts.silent {
        return None;
    }
    match arg {
        "-s" | "--silent" | "--silent=true" => opts.silent = true,
        "--silent=false" => {}
        "-sx" | "-xs" if !opts.skip_install => (opts.silent, opts.skip_install) = (true, true),
        _ => return None,
    }
    Some(())
}

pub(super) fn run(args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let command = if options.kind == Kind::Lane { "merge-abort" } else { "merge" };
    let root = match workspace_command::workspace_or_fail(args, command)? {
        Ok(root) => root,
        Err(outcome) => return Ok(outcome),
    };
    let installer = match start_recovery_installer(&root, &argv, options) {
        Ok(installer) => installer,
        Err(outcome) => return Ok(outcome),
    };
    if options.kind == Kind::Lane && !options.silent {
        return interactive::run(&root, args, options, installer);
    }
    let (environment, installation) = installation_session(installer)?;
    let mut startup = Startup::default();
    let prepared = match Prepared::plan(&root, options, &mut startup, environment) {
        Ok(prepared) => prepared,
        Err(error) => return handle_plan_error(&root, args, command, &startup, error),
    };
    execute_prepared(&root, args, options, &startup, prepared, installation)
}

fn start_recovery_installer(
    root: &Path,
    argv: &[&str],
    options: &Options,
) -> Result<Option<Installer>, Outcome> {
    if options.kind == Kind::Lane && options.skip_install {
        return Ok(None);
    }
    Installer::start(root, argv)
        .map(Some)
        .map_err(|err| Outcome::Declined(format!("merge recovery installation: {err}")))
}

fn handle_plan_error(
    root: &Path,
    args: &[OsString],
    command: &str,
    startup: &Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    if let Some(res) = failure::result(&error) {
        return workspace_command::execute_then(root, args, "merge-abort", |_output| {
            workspace_command::checkout_lifecycle::before(startup)?;
            workspace_command::checkout_lifecycle::loaded(startup);
            format_result(res, Kind::Lane, Chalk::detect(args))
        });
    }
    if startup.committed {
        return workspace_command::checkout_lifecycle::failure(root, args, command, startup, error);
    }
    Ok(Outcome::Declined(format!("merge recovery: {error}")))
}

fn execute_prepared(
    root: &Path,
    args: &[OsString],
    options: &Options,
    startup: &Startup,
    prepared: Prepared,
    installation: Option<HostInfo>,
) -> io::Result<Outcome> {
    let command = if options.kind == Kind::Lane { "merge-abort" } else { "merge" };
    if options.kind == Kind::Component {
        workspace_command::checkout_lifecycle::before(startup)?;
    }
    workspace_command::execute_then(root, args, command, |output| {
        if options.kind == Kind::Lane {
            workspace_command::checkout_lifecycle::before(startup)?;
        }
        workspace_command::checkout_lifecycle::loaded(startup);
        let report = execute(root, args, output, prepared, installation)?;
        super::status::cleanup_temporary(root)?;
        Ok(report)
    })
}

struct Prepared {
    engine: Engine,
    token: String,
    context: Value,
    capture: Capture,
    progress: Option<Progress>,
    ids: Vec<String>,
    kind: Kind,
}

impl Prepared {
    fn plan(
        root: &Path,
        options: &Options,
        startup: &mut Startup,
        mut inherited: Option<environments::Environments>,
    ) -> io::Result<Self> {
        let home = workspace_command::home();
        let mut engine = Engine::new()?;
        let request = prepare_request(root, &home, options)?;
        failure::preflight(&request)?;
        let environments = if options.kind == Kind::Component {
            Some(read_environment(&mut engine, root, &home, startup, inherited.take())?)
        } else {
            None
        };
        let (token, context, targets) =
            prepare_recovery_context(&mut engine, &request, options, startup)?;
        let environments = match environments {
            Some(environment) => environment,
            None => read_environment(&mut engine, root, &home, startup, inherited.take())?,
        };
        let capture = capture_recovery_targets(
            &mut engine,
            root,
            &home,
            &token,
            &context,
            &targets,
            options,
            startup,
            environments,
        )?;
        workspace_command::checkout_lifecycle::retain(Some(startup), &capture);
        Self::finalize_plan(engine, token, context, capture, options.kind)
    }

    fn finalize_plan(
        mut engine: Engine,
        token: String,
        context: Value,
        capture: Capture,
        kind: Kind,
    ) -> io::Result<Self> {
        let versions = workspace_command::semver_values(Some("reset"), &context)?;
        let semver = grammar::snapshot(versions.iter().map(String::as_str))
            .ok_or_else(|| decline("recovery semver grammar"))?;
        let plan: Value = engine.request(&json!({
            "kind":"commandRecoveryPlan","token":token,"current":capture.captured,
            "dependencyReadSet":capture.dependency_read_set(),"semver":semver,
        }))?;
        if plan.get("token").and_then(Value::as_str) != Some(&token) {
            return Err(decline("recovery plan token"));
        }
        let result = plan
            .get("result")
            .ok_or_else(|| decline("recovery result"))?
            .clone();
        format_result(&result, kind, Chalk::detect(&[]))?;
        let progress = Progress::parse(plan.get("progress"))?;
        let ids = install_ids(&result, kind)?;
        Ok(Self { engine, token, context, capture, progress, ids, kind })
    }

    fn commit(&mut self, root: &Path) -> io::Result<Value> {
        capture::commit(&mut self.engine, root, &self.context, &self.capture)?;
        let file_id = self.context["recoveryRestoredFileId"]
            .as_str()
            .map_or_else(workspace_command::file_id, str::to_owned);
        let mut read_set = self.capture.dependency_read_set();
        if self.kind == Kind::Lane && self.context["recoveryRestoredFileId"].is_null() {
            let restored: Value = self.engine.request(&json!({
                "kind":"commandRecoveryRestore","token":self.token,"fileId":file_id,
                "dependencyReadSet":read_set,
            }))?;
            if restored.get("restored") != Some(&Value::Bool(true)) {
                return Err(io::Error::other("recovery restore receipt"));
            }
            read_set =
                array(restored.get("dependencyReadSet"), "restored dependency read set")?.to_vec();
        }
        let applied: Value = self.engine.request(&json!({
            "kind":"commandRecoveryApply","token":self.token,"fileId":file_id,
            "dependencyReadSet":read_set,
        }))?;
        (applied.get("applied") == Some(&Value::Bool(true)))
            .then_some(())
            .ok_or_else(|| io::Error::other("recovery apply receipt"))?;
        applied
            .get("result")
            .cloned()
            .ok_or_else(|| io::Error::other("recovery apply result"))
    }
}

fn execute(
    root: &Path,
    args: &[OsString],
    output: &Output,
    mut prepared: Prepared,
    installation: Option<HostInfo>,
) -> io::Result<Report> {
    if let Some(progress) = &prepared.progress {
        progress.render_merge(output);
    }
    let result = prepared.commit(root)?;
    let mut report = format_result(&result, prepared.kind, Chalk::detect(args))?;
    if let Some(info) = installation
        && !prepared.ids.is_empty()
        && result.get("checkoutError").is_none()
    {
        let (installed, host) = install_retained(root, &mut prepared, info)?;
        if let Err(error) = &installed {
            output.failure(&format!("installation failed with the following error: {error}"));
        }
        host.call("installCanonicalFinalize", &json!({}))?;
        print!("{}", host.take_stdout());
        if let Err(error) = installed
            && prepared.kind != Kind::Component
        {
            report.data = Formatter::join(&[
                report.data,
                installation::error_report(Chalk::detect(args), &error.to_string()),
            ]);
        }
    }
    Ok(report)
}

fn install_retained(
    root: &Path,
    prepared: &mut Prepared,
    mut info: HostInfo,
) -> io::Result<(io::Result<()>, Arc<crate::host::Host>)> {
    let mut environment = capture::take_callback_environment(&mut prepared.capture)
        .ok_or_else(|| io::Error::other("recovery installation provider session"))?;
    print!("{}", ProjectedLinker::project_installation_workspace(root, &mut environment)?);
    let host = environment
        .into_tracking_host()
        .ok_or_else(|| io::Error::other("recovery installation Host"))?;
    info.file_id = workspace_command::file_id();
    let host = Arc::new(host);
    let installed = Installer::from_host(Arc::clone(&host), info)
        .with_initialized_cache(!prepared.capture.components.is_empty())
        .install(root, false, &prepared.ids);
    Ok((installed, host))
}

#[expect(
    clippy::too_many_arguments,
    reason = "Recovery capture forwards engine, token, context, and environments"
)]
fn capture_recovery_targets(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    token: &str,
    context: &Value,
    targets: &[Value],
    options: &Options,
    startup: &mut Startup,
    environments: environments::Environments,
) -> io::Result<Capture> {
    let captured = capture::capture_with(
        engine,
        root,
        home,
        context,
        targets,
        capture::CaptureOptions {
            environments: Some(environments),
            incomplete_reset: options.kind == Kind::Component,
            ..Default::default()
        },
    );
    match captured {
        Ok(capture) => Ok(capture),
        Err(error) if context["recoveryRestoredFileId"].is_string() => {
            failure::retain(startup, &error);
            let applied: Value = engine.request(&json!({
                "kind":"commandRecoveryApply",
                "token":token,
                "fileId":context["recoveryRestoredFileId"],
                "checkoutError":{"message":error.to_string()},
            }))?;
            Err(failure::restored(applied["result"].clone()))
        }
        Err(error) => Err(error),
    }
}
