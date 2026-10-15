//! Native `bit install` (`docs/rust/native-install.md`): the `bit-install`
//! crate runs the command; the JavaScript host serves what aspects implement.

use crate::{
    commands::Command,
    discovery::{self, NodeCli, Target},
    history::History,
    host::Host,
    native::Outcome,
    workspace,
};
use async_trait::async_trait;
use bit_install::{
    AfterInstall, AfterInstallResult, DetectRequest, HostInfo, Outcome as Installed,
};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, IsTerminal, Write},
    path::PathBuf,
    process::ExitCode,
    sync::Arc,
    thread,
};

pub const COMMAND: Command = Command { name: "install", aliases: &["in"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Prepared { argv, cli, cwd, root } = match prepare(args)? {
        Ok(prepared) => prepared,
        Err(reason) => return Ok(Outcome::Declined(reason)),
    };
    let terminal = Terminal::detect(&argv);
    let host = Arc::new(Host::new(cli, root.clone(), terminal.color));
    // A host that cannot describe the Node.js CLI leaves the command to it.
    let info = match host_info(&host, &terminal) {
        Ok(info) => info,
        Err(error) => return Ok(Outcome::Declined(format!("JavaScript host: {error}"))),
    };
    let history = History::start(&root, args);
    match run_install(cwd, Input::Argv(argv), info, host)? {
        Ok(Installed::Installed(_)) => {
            history.end(true);
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
        Ok(Installed::Help) => Ok(Outcome::Declined("--help".to_string())),
        Ok(Installed::Unsupported) => Ok(Outcome::Declined("unsupported workspace".to_string())),
        // `bit install` always asks before leaving external package manager mode.
        Ok(Installed::Skipped) => {
            history.end(true);
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
        Err(error) => {
            history.end(false);
            eprintln!("{}", terminal.red(&error.to_string()));
            Ok(Outcome::Exit(ExitCode::FAILURE))
        }
    }
}

/// What the command needs before any work starts.
struct Prepared {
    argv: Vec<String>,
    cli: NodeCli,
    cwd: PathBuf,
    root: PathBuf,
}

/// The checks that leave the command to the Node.js CLI; `Err` names the reason.
fn prepare(args: &[OsString]) -> io::Result<Result<Prepared, String>> {
    let Some(argv) = utf8(args) else {
        return Ok(Err("arguments are not UTF-8".to_string()));
    };
    // `bit install --help` is rendered by the Node.js CLI's command registry.
    if argv
        .iter()
        .any(|arg| arg == "--help" || arg == "-h")
    {
        return Ok(Err("--help".to_string()));
    }
    let Target::Entry(cli) = discovery::find()? else {
        return Ok(Err("the Node.js CLI is only reachable as a wrapper".to_string()));
    };
    if cli.bit_dir.is_none() {
        return Ok(Err("the entry is not inside an @teambit/bit package".to_string()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return Ok(Err("not inside a workspace".to_string()));
    };
    Ok(Ok(Prepared { argv, cli, cwd, root }))
}

fn utf8(args: &[OsString]) -> Option<Vec<String>> {
    args.iter()
        .map(|arg| arg.to_str().map(str::to_string))
        .collect()
}

/// The host computes everything `HostInfo` needs from Node and adds the PATH
/// the engine's lifecycle scripts must see; the terminal facts are ours.
/// It sets `PATH`, so it runs before this process starts any thread.
pub(super) fn host_info(host: &Host, terminal: &Terminal) -> io::Result<HostInfo> {
    let mut facts = host.call("hostInfo", &terminal.json())?;
    if let Some(Value::String(path)) = facts.get_mut("path").map(Value::take) {
        // SAFETY: no thread of this process exists yet; the runtime starts after.
        unsafe { env::set_var("PATH", path) };
    }
    serde_json::from_value(facts).map_err(io::Error::other)
}

/// What the install runs with: `bit install`'s arguments, or the options another
/// command passes to `InstallMain.install`.
pub(super) enum Input {
    Argv(Vec<String>),
    Options(Box<bit_install::InstallOptions>),
}

/// As `@pnpm/napi` runs its engine: a 32 MiB stack thread with its own runtime.
pub(super) fn run_install(
    cwd: PathBuf,
    input: Input,
    info: HostInfo,
    host: Arc<Host>,
) -> io::Result<io::Result<Installed>> {
    let worker = thread::Builder::new()
        .name("bit-install".to_string())
        .stack_size(32 * 1024 * 1024)
        .spawn(move || {
            let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build()?;
            let sink: bit_install::output::Sink = Arc::new(|text: &str| {
                let mut stdout = io::stdout().lock();
                let _ = stdout.write_all(text.as_bytes());
                let _ = stdout.flush();
            });
            let host = JsHost(host);
            Ok(runtime.block_on(async {
                match &input {
                    Input::Argv(argv) => bit_install::run(&cwd, argv, &info, &host, sink).await,
                    Input::Options(options) => {
                        bit_install::run_with_options(&cwd, options, &info, &host, sink).await
                    }
                }
            }))
        })?;
    worker.join().map_err(|_| io::Error::other("bit install panicked"))?
}

pub(super) struct Terminal {
    pub color: bool,
    tty: bool,
    loader: bool,
    non_interactive: bool,
}

impl Terminal {
    pub fn detect(argv: &[String]) -> Self {
        let tty = io::stdout().is_terminal();
        Self {
            color: color_enabled(tty),
            tty,
            loader: !env::var("BIT_DISABLE_SPINNER").is_ok_and(|value| yn(&value)),
            non_interactive: argv.iter().any(|arg| arg == "--json"),
        }
    }

    fn json(&self) -> Value {
        json!({
            "tty": self.tty,
            "color": self.color,
            "loader": self.loader,
            "nonInteractive": self.non_interactive,
        })
    }

    fn red(&self, text: &str) -> String {
        if self.color { format!("\u{1b}[31m{text}\u{1b}[39m") } else { text.to_string() }
    }
}

/// chalk's decision: `FORCE_COLOR`, then `NO_COLOR`, then a non-dumb terminal.
fn color_enabled(tty: bool) -> bool {
    if let Ok(force) = env::var("FORCE_COLOR") {
        return force != "0" && force != "false";
    }
    if env::var_os("NO_COLOR").is_some() {
        return false;
    }
    tty && env::var("TERM").is_ok_and(|term| term != "dumb")
}

/// The `yn` package: true for `true`, `1`, `yes`, `y`, `on`.
fn yn(value: &str) -> bool {
    matches!(
        value
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "true" | "1" | "yes" | "y" | "on",
    )
}

struct JsHost(Arc<Host>);

impl JsHost {
    async fn call<Response: DeserializeOwned>(
        &self,
        method: &'static str,
        params: Value,
    ) -> io::Result<Response> {
        let host = Arc::clone(&self.0);
        let value = tokio::task::spawn_blocking(move || host.call(method, &params))
            .await
            .map_err(io::Error::other)??;
        serde_json::from_value(value).map_err(io::Error::other)
    }
}

#[async_trait]
impl bit_install::Host for JsHost {
    async fn env_policy(&self, env_id: &str) -> io::Result<Option<Value>> {
        self.call("envPolicy", json!({ "envId": env_id })).await
    }

    async fn registered_env_policy(
        &self,
        env_id: &str,
        aspect_ids: &[String],
    ) -> io::Result<Option<Value>> {
        self.call("registeredEnvPolicy", json!({ "envId": env_id, "aspectIds": aspect_ids })).await
    }

    async fn dev_patterns(&self, env_id: &str) -> io::Result<Option<Value>> {
        self.call("devPatterns", json!({ "envId": env_id })).await
    }

    async fn env_falls_back(&self, env_id: &str) -> io::Result<bool> {
        self.call("envFallsBack", json!({ "envId": env_id })).await
    }

    async fn prepare_install(&self, aspect_ids: &[String]) -> io::Result<()> {
        self.call::<Value>("prepareInstall", json!({ "aspectIds": aspect_ids })).await?;
        Ok(())
    }

    async fn dependency_policies(&self, extension_ids: &[String]) -> io::Result<Option<Value>> {
        self.call("dependencyPolicies", json!({ "extensionIds": extension_ids })).await
    }

    async fn detect_dependencies(&self, request: &DetectRequest<'_>) -> io::Result<Option<Value>> {
        self.call("detectDependencies", json!(request)).await
    }

    async fn app_types(&self) -> io::Result<Vec<String>> {
        self.call("appTypes", json!({})).await
    }

    async fn package_json_props(&self, env_id: &str) -> io::Result<Value> {
        self.call("packageJsonProps", json!({ "envId": env_id })).await
    }

    async fn transform_package_json(&self, component: &str, manifest: Value) -> io::Result<Value> {
        self.call("transformPackageJson", json!({ "component": component, "manifest": manifest }))
            .await
    }

    async fn after_install(&self, request: AfterInstall) -> io::Result<AfterInstallResult> {
        let request = serde_json::to_value(request).map_err(io::Error::other)?;
        let mut response: Value = self.call("afterInstall", request).await?;
        let output = response["stdout"]
            .as_str()
            .ok_or_else(|| io::Error::other("JavaScript host afterInstall stdout"))?;
        if !output.is_empty() {
            let mut stdout = io::stdout().lock();
            stdout.write_all(output.as_bytes())?;
            stdout.flush()?;
        }
        serde_json::from_value(response["value"].take()).map_err(io::Error::other)
    }

    /// The terminal is this process's, so the question is asked here.
    async fn confirm(&self, question: &str) -> io::Result<bool> {
        let question = question.to_string();
        tokio::task::spawn_blocking(move || confirm(&question)).await.map_err(io::Error::other)?
    }
}

/// The `yesno` package: repeat until a yes or no answer; end of input is no.
pub(super) fn confirm(question: &str) -> io::Result<bool> {
    let stdin = io::stdin();
    loop {
        print!("{question} ");
        io::stdout().flush()?;
        let mut line = String::new();
        if stdin.read_line(&mut line)? == 0 {
            return Ok(false);
        }
        match line
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "y" | "yes" => return Ok(true),
            "n" | "no" => return Ok(false),
            _ => println!("\nInvalid Response.\nAnswer either yes : (y, yes) \nOr no: (n, no) \n"),
        }
    }
}
