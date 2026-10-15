//! `Helper` of `@teambit/legacy.e2e-helper`, for the native CLI: each case gets its own
//! directory holding the local workspace and the remote scopes, and runs `bit` from
//! `native/` with the Node.js CLI behind it.

pub(crate) mod config;
pub(crate) mod setup;
pub use fixtures::FOO_FIXTURE;

mod fixtures;

use crate::known_failure::{KnownFailure, KnownResult};
use serde_json::{Value, json};
use std::{
    ffi::OsStr,
    fmt::Write,
    fs,
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
};
use tempfile::TempDir;

/// `e2e-scopes.ts`: the case's directory and the scopes in it.
pub struct Scopes {
    pub e2e_dir: PathBuf,
    pub local_path: PathBuf,
    pub remote: String,
    pub remote_path: PathBuf,
}

pub struct Helper {
    _dir: TempDir,
    pub scopes: Scopes,
}

/// One `bit` run. `stderr` holds no trace lines; `trace` does.
#[derive(Debug)]
pub struct Run {
    pub stdout: String,
    pub stderr: String,
    pub trace: String,
    pub status: ExitStatus,
    /// Whether the command ran in Rust, not on the Node.js CLI.
    pub native: bool,
}

/// `generateRandomStr`.
fn random_str() -> String {
    let mut bytes = [0u8; 4];
    getrandom::fill(&mut bytes).unwrap();
    bytes
        .iter()
        .fold(String::new(), |mut out, byte| {
            let _ = write!(out, "{byte:02x}");
            out
        })
}

impl Helper {
    /// Seed a remote lane's hidden `updateDependents` through the released CLI.
    pub fn seed_hidden_update_dependent(&self, component_id: &str, lane_id: &str) {
        let shared = setup::shared();
        let seed = self.scopes.e2e_dir.join(format!("{}-seed", random_str()));
        setup::copy_dir(&shared.bare_scope_template, &seed);
        config::update_scope_json(&seed.join("scope.json"), |scope| {
            scope.insert(
                "name".into(),
                json!(
                    seed.file_name()
                        .unwrap()
                        .to_string_lossy()
                ),
            );
            let mut remotes = serde_json::Map::new();
            remotes.insert(
                self.scopes.remote.clone(),
                json!(format!("file://{}", self.scopes.remote_path.display())),
            );
            scope.insert("remotes".into(), Value::Object(remotes));
        });
        let output = Command::new("node")
            .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/e2e/helper/snap_from_scope.js"))
            .arg(&shared.node_cli)
            .arg(&seed)
            .arg(component_id)
            .arg(lane_id)
            .env("HOME", shared.root.join("home"))
            .env("USERPROFILE", shared.root.join("home"))
            .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
            .output()
            .unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    }

    pub fn new() -> Self {
        let shared = setup::shared();
        let dir = tempfile::Builder::new()
            .prefix("case-")
            .tempdir_in(&shared.root)
            .unwrap();
        let e2e_dir = dir.path().to_path_buf();
        let local = format!("{}-local", random_str());
        let remote = format!("{}-remote", random_str());
        let scopes = Scopes {
            local_path: e2e_dir.join(local),
            remote_path: e2e_dir.join(&remote),
            e2e_dir,
            remote,
        };
        fs::create_dir_all(&scopes.local_path).unwrap();
        Self { _dir: dir, scopes }
    }

    /// `reInitWorkspace()`, with the remote scope as the default scope.
    pub fn re_init_workspace(&self) {
        self.re_init_workspace_with(true);
    }

    /// `reInitWorkspace({ addRemoteScopeAsDefaultScope })`.
    pub fn re_init_workspace_with(&self, remote_as_default_scope: bool) {
        let local = &self.scopes.local_path;
        let _ = fs::remove_dir_all(local);
        copy_workspace_template(local);
        if remote_as_default_scope {
            config::set_workspace_aspect_key(local, "defaultScope", json!(self.scopes.remote));
        }
        config::set_workspace_key(local, "teambit.preview/preview", json!({ "disabled": true }));
        config::set_workspace_key(
            local,
            "teambit.component/issues",
            json!({ "ignoreIssues": ["MissingManuallyConfiguredPackages"] }),
        );
    }

    /// `setWorkspaceWithRemoteScope()`.
    pub fn set_workspace_with_remote_scope(&self) {
        self.re_init_workspace();
        self.re_init_remote_scope();
        self.add_remote_scope();
    }

    /// `reInitRemoteScope()`: a bare scope named after its directory.
    pub fn re_init_remote_scope(&self) {
        let remote = &self.scopes.remote_path;
        let _ = fs::remove_dir_all(remote);
        setup::copy_dir(&setup::shared().bare_scope_template, remote);
        config::update_scope_json(&remote.join("scope.json"), |scope| {
            scope.insert("name".into(), json!(self.scopes.remote));
        });
    }

    /// `addRemoteScope()`: what `bit remote add file://<remote>` writes.
    pub fn add_remote_scope(&self) {
        let url = format!("file://{}", self.scopes.remote_path.display());
        config::update_scope_json(&self.scopes.local_path.join(".bit/scope.json"), |scope| {
            let remotes = scope
                .entry("remotes")
                .or_insert_with(|| json!({}));
            remotes[&self.scopes.remote] = Value::String(url);
        });
    }

    /// `cloneWorkspace()`: a copy of the workspace to come back to.
    pub fn clone_workspace(&self) -> PathBuf {
        let clone = self.scopes.e2e_dir.join(format!("{}-clone", random_str()));
        setup::copy_dir(&self.scopes.local_path, &clone);
        clone
    }

    pub fn clone_remote_scope(&self) -> PathBuf {
        self.clone_remote_at(&self.scopes.remote_path)
    }

    pub fn clone_remote_at(&self, remote: &Path) -> PathBuf {
        let clone = self.scopes.e2e_dir.join(format!("{}-remote-clone", random_str()));
        setup::copy_dir(remote, &clone);
        clone
    }

    pub fn restore_remote_scope(&self, clone: &Path) {
        Self::restore_remote_at(&self.scopes.remote_path, clone);
    }

    pub fn restore_remote_at(remote: &Path, clone: &Path) {
        let _ = fs::remove_dir_all(remote);
        setup::copy_dir(clone, remote);
    }

    /// `getClonedWorkspace(clone)`.
    pub fn get_cloned_workspace(&self, clone: &Path) {
        let _ = fs::remove_dir_all(&self.scopes.local_path);
        setup::copy_dir(clone, &self.scopes.local_path);
    }

    /// `bit <line>` in the workspace, on either CLI.
    pub fn cmd(&self, line: &str) -> Run {
        Self::cmd_in(&self.scopes.local_path, line)
    }

    pub fn cmd_in(cwd: &Path, line: &str) -> Run {
        Self::cmd_in_with(cwd, line, &[])
    }

    /// `bit <line>` in `cwd` with `env` on top of the case environment.
    pub fn cmd_in_with(cwd: &Path, line: &str, env: &[(&str, &OsStr)]) -> Run {
        let output = setup::bit_command(setup::shared(), cwd)
            .args(split_args(line))
            .envs(env.iter().copied())
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        let (trace, stderr): (Vec<&str>, Vec<&str>) = stderr
            .lines()
            .partition(|line| line.starts_with("bit-native: "));
        Run {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: stderr.join("\n"),
            native: !trace
                .iter()
                .any(|line| line.starts_with("bit-native: delegating")),
            trace: trace.join("\n"),
            status: output.status,
        }
    }

    /// `runCmd`: `bit <line>` on either CLI, which must succeed; its stdout.
    pub fn run(&self, line: &str) -> String {
        succeeded(line, self.cmd(line))
    }

    /// `bit <line>`, which must run natively and succeed; its stdout.
    pub fn native(&self, line: &str) -> String {
        succeeded(line, self.native_run(line))
    }

    /// `bit <line>`, which must run natively, whatever its exit code.
    pub fn native_run(&self, line: &str) -> Run {
        let run = self.cmd(line);
        assert!(run.native || on_node(), "`bit {line}` ran on the Node.js CLI:\n{}", run.trace);
        run
    }

    /// `bit <line>` when it runs natively, else the [`KnownFailure`].
    pub fn native_or_known(&self, line: &str) -> KnownResult<Run> {
        known(self.cmd(line))
    }

    /// A global config of the case's own, the shared one with `key` set (`bit config set`),
    /// for `BIT_GLOBALS_DIR`: the shared one serves every case running in parallel.
    pub fn own_global_config(&self, key: &str, value: &str) -> PathBuf {
        let globals = self.scopes.e2e_dir.join("globals");
        fs::create_dir_all(globals.join("config")).unwrap();
        let shared = setup::shared().root.join("globals/config/config.json");
        let mut config: Value = serde_json::from_slice(&fs::read(shared).unwrap()).unwrap();
        config[key] = Value::String(value.into());
        fs::write(globals.join("config/config.json"), config.to_string()).unwrap();
        globals
    }

    /// `bit <line>` when it runs natively and succeeds: its stdout.
    pub fn native_output_or_known(&self, line: &str) -> KnownResult<String> {
        self.native_or_known(line).map(|run| succeeded(line, run))
    }

    /// `statusJson()`: `bit status --json` when it runs natively.
    pub fn status_json_or_known(&self) -> KnownResult<Value> {
        self.native_output_or_known("status --json").map(|output| parse(&output))
    }

    /// The issue types `bit status --json` reports (`getAllIssuesFromStatus`), when it
    /// runs natively.
    pub fn status_issues_or_known(&self) -> KnownResult<Vec<String>> {
        self.status_json_or_known().map(|status| issue_types(&status))
    }

    /// `outputFile`.
    pub fn output_file(&self, relative: &str, data: &str) {
        let path = self.scopes.local_path.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, data).unwrap();
    }

    /// `appendFile`.
    pub fn append_file(&self, relative: &str, data: &str) {
        let path = self.scopes.local_path.join(relative);
        let mut content = fs::read_to_string(&path).unwrap_or_default();
        content.push_str(data);
        fs::write(path, content).unwrap();
    }

    /// `deletePath`.
    pub fn delete_path(&self, relative: &str) {
        let path = self.scopes.local_path.join(relative);
        if path.is_dir() && !path.is_symlink() {
            fs::remove_dir_all(path).unwrap();
        } else if path.symlink_metadata().is_ok() {
            fs::remove_file(path).unwrap();
        }
    }
}

/// `run` when it ran natively, else the [`KnownFailure`].
pub fn known(run: Run) -> KnownResult<Run> {
    if run.native || on_node() {
        Ok(run)
    } else if env_flag("BIT_E2E_NO_KNOWN_FAILURES") {
        panic!("still runs on the Node.js CLI:\n{}", run.trace)
    } else {
        Err(KnownFailure { reason: run.trace })
    }
}

/// `removeChalkCharacters`: the text without ANSI escape sequences.
pub fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(char) = chars.next() {
        if char == '\u{1b}' {
            chars.by_ref().find(char::is_ascii_alphabetic);
        } else {
            out.push(char);
        }
    }
    out
}

/// `BIT_E2E_ON_NODE=1`: a command the Node.js CLI runs counts as native, so every case,
/// known failures included, checks its assertions against the Node.js CLI.
fn on_node() -> bool {
    env_flag("BIT_E2E_ON_NODE")
}

fn env_flag(name: &str) -> bool {
    std::env::var_os(name).is_some_and(|value| value == "1")
}

/// `copyWorkspaceTemplate`: the template with the workspace and scope named after `target`.
fn copy_workspace_template(target: &Path) {
    let template = &setup::shared().workspace_template;
    setup::copy_dir(template, target);
    let template_name = template
        .file_name()
        .unwrap()
        .to_string_lossy();
    let target_name = target
        .file_name()
        .unwrap()
        .to_string_lossy();
    let jsonc = target.join("workspace.jsonc");
    let content = fs::read_to_string(&jsonc).unwrap();
    let from = format!(r#""name": "{template_name}""#);
    assert!(
        content.contains(&from),
        "`bit init` no longer names the workspace after its directory",
    );
    fs::write(&jsonc, content.replace(&from, &format!(r#""name": "{target_name}""#))).unwrap();
    config::update_scope_json(&target.join(".bit/scope.json"), |scope| {
        scope.insert("name".into(), json!(format!("{target_name}-local-{}", random_str())));
    });
}

fn succeeded(line: &str, run: Run) -> String {
    assert!(
        run.status.success(),
        "`bit {line}` failed ({}):\n{}\n{}",
        run.status,
        run.stdout,
        run.stderr,
    );
    run.stdout
}

pub fn parse(stdout: &str) -> Value {
    serde_json::from_str(stdout).unwrap_or_else(|error| panic!("{error}: {stdout}"))
}

/// The length of a JSON array.
pub fn len(value: &Value) -> usize {
    value
        .as_array()
        .unwrap_or_else(|| panic!("an array: {value}"))
        .len()
}

pub fn issue_types(status: &Value) -> Vec<String> {
    status["componentsWithIssues"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|component| component["issues"].as_array().unwrap())
        .map(|issue| {
            issue["type"]
                .as_str()
                .unwrap()
                .to_string()
        })
        .collect()
}

/// The arguments of a command line: whitespace separates them, double quotes group.
fn split_args(line: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut started = false;
    for char in line.chars() {
        match char {
            '"' => (quoted, started) = (!quoted, true),
            char if char.is_whitespace() && !quoted => {
                if started {
                    args.push(std::mem::take(&mut current));
                }
                started = false;
            }
            char => {
                current.push(char);
                started = true;
            }
        }
    }
    if started {
        args.push(current);
    }
    args
}
