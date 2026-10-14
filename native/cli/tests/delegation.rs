//! The built `bit` against a stub Node.js CLI that echoes its arguments and
//! exits with a chosen code: what users see when a command is delegated.

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};
use tempfile::TempDir;

const STUB: &str = r"
process.stdout.write(JSON.stringify(process.argv.slice(2)));
process.exit(Number(process.env.STUB_EXIT_CODE ?? 0));
";

fn stub(dir: &Path) -> PathBuf {
    let entry = dir.join("bin").join("bit.js");
    fs::create_dir_all(entry.parent().unwrap()).unwrap();
    fs::write(&entry, STUB).unwrap();
    entry
}

fn bit(cwd: &Path, entry: &Path, args: &[&str], env: &[(&str, &str)]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_bit"));
    command
        .current_dir(cwd)
        .args(args)
        .env("BIT_NODE_CLI", entry)
        .env_remove("BIT_NATIVE")
        .env_remove("BIT_NATIVE_TRACE");
    for (key, value) in env {
        command.env(key, value);
    }
    command.output().unwrap()
}

fn echoed(output: &Output) -> Vec<String> {
    serde_json::from_slice(&output.stdout)
        .unwrap_or_else(|error| {
            panic!(
                "{error}: stdout {:?}, stderr {:?}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr),
            )
        })
}

#[test]
fn delegates_arguments_and_exit_code() {
    let dir = TempDir::new().unwrap();
    let entry = stub(dir.path());
    let output = bit(
        dir.path(),
        &entry,
        &["status", "--json", "with space", "ünïcode"],
        &[("STUB_EXIT_CODE", "7")],
    );
    assert_eq!(echoed(&output), ["status", "--json", "with space", "ünïcode"]);
    assert_eq!(output.status.code(), Some(7));
}

#[test]
fn delegates_without_arguments() {
    let dir = TempDir::new().unwrap();
    let entry = stub(dir.path());
    let output = bit(dir.path(), &entry, &[], &[]);
    assert!(echoed(&output).is_empty());
    assert!(output.status.success());
}

#[test]
fn native_command_outside_a_workspace_declines_to_node() {
    let dir = TempDir::new().unwrap();
    let entry = stub(dir.path());
    let output = bit(dir.path(), &entry, &["install"], &[]);
    assert_eq!(echoed(&output), ["install"]);
}

#[test]
fn native_command_help_declines_to_node() {
    let dir = TempDir::new().unwrap();
    let entry = stub(dir.path());
    fs::write(dir.path().join("workspace.jsonc"), "{}").unwrap();
    let output = bit(dir.path(), &entry, &["in", "--help"], &[]);
    assert_eq!(echoed(&output), ["in", "--help"]);
}

#[test]
fn bit_native_off_delegates_native_commands() {
    let dir = TempDir::new().unwrap();
    let entry = stub(dir.path());
    fs::write(dir.path().join("workspace.jsonc"), "{}").unwrap();
    let output = bit(dir.path(), &entry, &["install"], &[("BIT_NATIVE", "off")]);
    assert_eq!(echoed(&output), ["install"]);
}

#[test]
fn trace_reports_the_delegated_command_on_stderr() {
    let dir = TempDir::new().unwrap();
    let entry = stub(dir.path());
    let output = bit(dir.path(), &entry, &["list"], &[("BIT_NATIVE_TRACE", "1")]);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("bit-native: delegating:"), "{stderr}");
    assert_eq!(echoed(&output), ["list"]);
}
