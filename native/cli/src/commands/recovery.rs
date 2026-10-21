//! Native component and lane merge abort through the workspace recovery plan.
//! All validation and file restoration stay in the Rust workspace engine.
mod failure;
mod interactive;
mod report;

use report::format_result;

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
use crate::{native::Outcome, workspace};
use bit_install::{HostInfo, output::Output};
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, path::Path, sync::Arc};

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

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::excessive_cognitive_complexity,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
fn parse(args: &[&str], kind: Kind) -> Option<Options> {
    let mut pattern = None;
    let mut abort = false;
    let mut silent = false;
    let mut skip_install = false;
    let mut verbose = false;
    for arg in args {
        match *arg {
            "--abort" if kind == Kind::Component && !abort => abort = true,
            "-s" | "--silent" if kind == Kind::Lane && !silent => silent = true,
            "-x" | "--skip-dependency-installation" if !skip_install => skip_install = true,
            "--verbose" if !verbose => verbose = true,
            value if kind == Kind::Component && pattern.is_none() && valid_pattern(value) => {
                pattern = Some(value.to_string());
            }
            _ => return None,
        }
    }
    if kind == Kind::Component && !abort {
        return None;
    }
    Some(Options { kind, pattern, skip_install, verbose, silent })
}

fn valid_pattern(pattern: &str) -> bool {
    !pattern.is_empty()
        && pattern.len() <= 256
        && !pattern.starts_with('-')
        && pattern
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"_./-".contains(&byte)
            })
}

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::excessive_cognitive_complexity,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
pub(super) fn run(args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    // Component abort calls checkout(reset) without forwarding -x; the Node
    // command installs even when -x was supplied to merge.
    let installer = if options.kind == Kind::Lane && options.skip_install {
        None
    } else {
        match Installer::start(&root, &argv) {
            Ok(installer) => Some(installer),
            Err(error) => {
                return Ok(Outcome::Declined(format!("merge recovery installation: {error}")));
            }
        }
    };
    if options.kind == Kind::Lane && !options.silent {
        return interactive::run(&root, args, options, installer);
    }
    let (environment, installation) = installation_session(installer)?;
    let mut startup = Startup::default();
    let prepared = match Prepared::plan(&root, options, &mut startup, environment) {
        Ok(prepared) => prepared,
        Err(error) if failure::result(&error).is_some() => {
            return workspace_command::execute_then(&root, args, "merge-abort", |_output| {
                workspace_command::checkout_lifecycle::before(&startup)?;
                workspace_command::checkout_lifecycle::loaded(&startup);
                format_result(failure::result(&error).unwrap(), Kind::Lane, Chalk::detect(args))
            });
        }
        Err(error) if startup.committed => {
            let command = if options.kind == Kind::Lane { "merge-abort" } else { "merge" };
            return workspace_command::checkout_lifecycle::failure(
                &root, args, command, &startup, error,
            );
        }
        Err(error) => return Ok(Outcome::Declined(format!("merge recovery: {error}"))),
    };
    execute_prepared(&root, args, options, &startup, prepared, installation)
}

fn installation_session(
    installer: Option<Installer>,
) -> io::Result<(Option<environments::Environments>, Option<HostInfo>)> {
    match installer {
        Some(installer) => {
            let (environment, info) = installer.into_parts()?;
            Ok((Some(environment), Some(info)))
        }
        None => Ok((None, None)),
    }
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
    #[cfg_attr(
        dylint_lib = "perfectionist",
        expect(
            perfectionist::overly_long_function,
            perfectionist::too_many_local_bindings,
            reason = "Existing CLI orchestration is retained until its operation is decomposed"
        )
    )]
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
        let prepared: Value = engine.request(&request)?;
        let token = text(prepared.get("token"))?.to_string();
        let mut context = prepared
            .get("context")
            .filter(|value| value.is_object())
            .ok_or_else(|| decline("recovery context"))?
            .clone();
        let targets = array(prepared.get("captureTargets"), "recovery capture targets")?;
        if targets.len() > 4096 {
            return Err(decline("recovery target limit"));
        }
        if options.kind == Kind::Lane {
            startup.committed = true;
            let file_id = workspace_command::file_id();
            let _: Value = engine.request(
                &json!({"kind":"commandRecoveryRestore","token":token,"fileId":file_id}),
            )?;
            context["recoveryRestoredFileId"] = json!(file_id);
        }
        let environments = match environments {
            Some(environment) => environment,
            None => read_environment(&mut engine, root, &home, startup, inherited.take())?,
        };
        let captured = capture::capture_with(
            &mut engine,
            root,
            &home,
            &context,
            targets,
            capture::CaptureOptions {
                environments: Some(environments),
                incomplete_reset: options.kind == Kind::Component,
                ..Default::default()
            },
        );
        let capture = match captured {
            Ok(capture) => capture,
            Err(error) if context["recoveryRestoredFileId"].is_string() => {
                failure::retain(startup, &error);
                let applied:Value=engine.request(&json!({"kind":"commandRecoveryApply","token":token,
                    "fileId":context["recoveryRestoredFileId"],"checkoutError":{"message":error.to_string()}}))?;
                return Err(failure::restored(applied["result"].clone()));
            }
            Err(error) => return Err(error),
        };
        workspace_command::checkout_lifecycle::retain(Some(startup), &capture);
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
        format_result(&result, options.kind, Chalk::detect(&[]))?;
        let progress = Progress::parse(plan.get("progress"))?;
        let ids = install_ids(&result, options.kind)?;
        Ok(Self { engine, token, context, capture, progress, ids, kind: options.kind })
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
        if applied.get("applied") != Some(&Value::Bool(true)) {
            return Err(io::Error::other("recovery apply receipt"));
        }
        Ok(applied
            .get("result")
            .ok_or_else(|| io::Error::other("recovery apply result"))?
            .clone())
    }
}

fn read_environment(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    startup: &mut Startup,
    inherited: Option<environments::Environments>,
) -> io::Result<environments::Environments> {
    let environment = match inherited {
        Some(environment) => {
            environments::read_inherited_context(engine, root, home, None, startup, environment)?.1
        }
        None => environments::read_context(engine, root, home, false, None, startup)?.1,
    };
    Ok(environment.for_checkout())
}

fn prepare_request(root: &Path, home: &Path, options: &Options) -> io::Result<Value> {
    let operation = if options.kind == Kind::Lane { "laneAbort" } else { "componentAbort" };
    let mut request = json!({
        "kind":"commandRecoveryPrepare","root":root,"home":home,
        "globalRemotesFile":cache::cache_root().join("config/global-remotes.json"),
        "operation":operation,"dependencyGrammar":dependency_grammar()?,
        "options":{"silent":options.kind==Kind::Lane,"verbose":options.verbose,
            "skipDependencyInstallation":true,"callbackLifecycle":true},
    });
    if let Some(pattern) = &options.pattern {
        request["options"]["pattern"] = json!(pattern);
    }
    Ok(request)
}

fn install_ids(result: &Value, kind: Kind) -> io::Result<Vec<String>> {
    if kind == Kind::Lane {
        return installation::component_ids(&result["checkoutResults"]);
    }
    let rows = array(result.get("abortedComponents"), "aborted components")?;
    let mut ids = rows
        .iter()
        .map(|row| Id::parse(text(row.get("id"))?).map(|id| id.display()))
        .collect::<io::Result<Vec<_>>>()?;
    ids.sort();
    ids.dedup();
    Ok(ids)
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
