//! `DeleteCmd --hard`: select remotes before an irreversible single-attempt delete.

mod remote;
mod report;
mod select;

use super::{Chalk, workspace_command};
use crate::{native::Outcome, workspace};
use bit_client_transfer::{GlobalConfig, http::Network, remotes::Remotes};
use bit_workspace_config::global_config_dir;
use serde_json::Value;
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
    process::ExitCode,
    sync::Arc,
};

struct Options<'a> {
    pattern: &'a str,
    force: bool,
    has_range: bool,
}

struct Context {
    root: Option<PathBuf>,
    remotes: Remotes,
    network: Arc<Network>,
    hub_network: Arc<Network>,
    hub_url: String,
}

pub(super) fn run(args: &[OsString], argv: &[&str]) -> io::Result<Outcome> {
    let Some(options) = parse(argv) else {
        return Ok(Outcome::Declined("outside the native remote hard-delete grammar".into()));
    };
    let cwd = env::current_dir()?;
    let root = workspace::root(&cwd);
    let config_dir = global_config_dir();
    let global = bit_install::config::load_global_config(&config_dir)?;
    if !feature_enabled(&global) {
        return Ok(Outcome::Declined(
            "hard-delete requires the published confirmation guard".into(),
        ));
    }
    if options.has_range {
        return emit_range_not_supported(&cwd, root.as_deref(), args);
    }
    let Some(context) = Context::prepare(root, global, &config_dir).ok() else {
        return Ok(Outcome::Declined("remote hard-delete connection preflight".into()));
    };
    let selected = match select::components(&context, options.pattern) {
        Ok(ids) => ids,
        Err(error) => {
            return Ok(Outcome::Declined(format!("remote hard-delete selection: {error}")));
        }
    };
    let prepared = match remote::prepare(&context, &selected, options.force, false) {
        Ok(prepared) => prepared,
        Err(error) => {
            return Ok(Outcome::Declined(format!("remote hard-delete preflight: {error}")));
        }
    };
    execute(args, &context, prepared, options.pattern.contains('*'))
}

fn emit_range_not_supported(
    cwd: &Path,
    root: Option<&Path>,
    args: &[OsString],
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI delete --hard --range".into()));
    }
    let err = io::Error::other("--range is not supported with --hard flag");
    if let Some(ws_root) = root {
        return workspace_command::execute_then(ws_root, args, "delete", |_| Err(err));
    }
    workspace_command::execute_failure_scope(cwd, args, "delete", false, "", err)
}

pub(in crate::commands) fn lanes(
    args: &[OsString],
    ids: &[String],
    force: bool,
) -> io::Result<Outcome> {
    let root = workspace::root(&env::current_dir()?);
    let config_dir = global_config_dir();
    let global = bit_install::config::load_global_config(&config_dir)?;
    let context = match Context::prepare(root, global, &config_dir) {
        Ok(context) => context,
        Err(error) => return Ok(Outcome::Declined(format!("remote lane connection: {error}"))),
    };
    let prepared = match remote::prepare(&context, ids, force, true) {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("remote lane preflight: {error}"))),
    };
    execute(args, &context, prepared, false)
}

fn execute(
    args: &[OsString],
    context: &Context,
    prepared: remote::Prepared,
    wildcard: bool,
) -> io::Result<Outcome> {
    if let Some(root) = &context.root {
        return execute_workspace(root, args, context, prepared, wildcard);
    }
    execute_bare(args, context, prepared)
}

fn execute_workspace(
    root: &Path,
    args: &[OsString],
    context: &Context,
    prepared: remote::Prepared,
    wildcard: bool,
) -> io::Result<Outcome> {
    let lanes = prepared.lanes;
    workspace_command::execute_then(root, args, if lanes { "remove" } else { "delete" }, |output| {
        if !lanes {
            output.status("removing components");
            if wildcard {
                output.status("listing remote components");
            }
            output.status("removing components");
        }
        let receipts = prepared.commit(context)?;
        Ok(workspace_command::results::Report {
            data: receipt_report(&receipts, lanes, args),
            code: 0,
            details: None,
        })
    })
}

fn execute_bare(
    args: &[OsString],
    context: &Context,
    prepared: remote::Prepared,
) -> io::Result<Outcome> {
    let lanes = prepared.lanes;
    let output = workspace_command::loader_output(Chalk::detect(args), false);
    let command = if lanes { "remove" } else { "delete" };
    output.restart(&format!(r#"running command "{command}"..."#));
    let receipts = prepared.commit(context);
    output.stop();
    let report = receipt_report(&receipts?, lanes, args);
    println!("{report}");
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn receipt_report(receipts: &[Value], lanes: bool, args: &[OsString]) -> String {
    if lanes {
        report::lanes(receipts, Chalk::detect(args))
    } else {
        report::components(receipts, Chalk::detect(args))
    }
}

#[derive(Default)]
struct ParseState<'a> {
    pattern: Option<&'a str>,
    hard: bool,
    silent: bool,
    force: bool,
    has_range: bool,
}

fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut state = ParseState::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        apply_hard_arg(arg, &mut iter, &mut state)?;
    }
    (state.hard && state.silent).then_some(Options {
        pattern: state.pattern?,
        force: state.force,
        has_range: state.has_range,
    })
}

fn apply_hard_arg<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    state: &mut ParseState<'a>,
) -> Option<()> {
    match arg {
        "--no-color" => {}
        "--hard" | "--hard=true" => state.hard = true,
        "--hard=false" => state.hard = false,
        "-s" | "--silent" | "--silent=true" => state.silent = true,
        "--silent=false" => state.silent = false,
        "-f" | "--force" | "--force=true" => state.force = true,
        "--force=false" => state.force = false,
        "-sf" | "-fs" => {
            state.silent = true;
            state.force = true;
        }
        "--range" => {
            let val = iter.next()?;
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            state.has_range = true;
        }
        _ if let Some(val) = arg.strip_prefix("--range=") => {
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            state.has_range = true;
        }
        value if !value.starts_with('-') && state.pattern.is_none() => state.pattern = Some(value),
        _ => return None,
    }
    Some(())
}

fn feature_enabled(global: &GlobalConfig) -> bool {
    let features = env::var("BIT_FEATURES")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| env::var("BIT_CONFIG_FEATURES").ok())
        .or_else(|| {
            global
                .get("features")
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
    features.is_some_and(|features| {
        features
            .split(',')
            .any(|feature| feature.trim() == "hard-delete")
    })
}

impl Context {
    fn prepare(root: Option<PathBuf>, global: GlobalConfig, config_dir: &Path) -> io::Result<Self> {
        if root.as_deref().is_some_and(super::super::installation::Installer::needs_canonical) {
            return Err(io::Error::other(
                "custom workspace providers require canonical remote deletion startup",
            ));
        }
        let scope_path = root.as_deref().map(bit_object_import::scope_path);
        let scope: Value = scope_path
            .as_ref()
            .map(|path| fs::read(path.join("scope.json")))
            .transpose()?
            .map(|bytes| serde_json::from_slice(&bytes))
            .transpose()?
            .unwrap_or(Value::Null);
        if !scope["resolverPath"].is_null() || !scope["hooksPath"].is_null() {
            return Err(io::Error::other("custom remote resolver or hooks"));
        }
        validate_remote_hosts(&scope["remotes"])?;
        match fs::read(config_dir.join("global-remotes.json")) {
            Ok(bytes) => {
                if bytes.len() > 1024 * 1024 {
                    return Err(io::Error::other("global remotes budget"));
                }
                validate_remote_hosts(&serde_json::from_slice::<Value>(&bytes)?)?;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let cli = workspace_command::NodeCli::find()?;
        let remotes = Remotes::load(&scope, config_dir, &global)?;
        let effective = bit_client_transfer::config::effective(global, &scope, &Value::Null);
        let hub_url =
            format!("{}/exporter", bit_client_transfer::remotes::symphony_url(&effective));
        let network =
            Arc::new(Network::new(&effective, &cli.version, scope["name"].as_str(), None)?);
        let hub_network = Arc::new(Network::new(&effective, &cli.version, None, None)?);
        Ok(Self { root, remotes, network, hub_network, hub_url })
    }
}

fn validate_remote_hosts(value: &Value) -> io::Result<()> {
    if value.is_null() {
        return Ok(());
    }
    let hosts = value.as_object().ok_or_else(|| io::Error::other("invalid remote hosts"))?;
    if hosts
        .values()
        .any(|host| !host.is_string())
    {
        return Err(io::Error::other("invalid remote host"));
    }
    Ok(())
}
