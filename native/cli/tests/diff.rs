//! `bit diff` inputs the native command leaves to the Node.js CLI, each for
//! its traced reason.

use std::{
    fs,
    path::Path,
    process::{Command, Output},
};
use tempfile::TempDir;

/// Echoes its arguments, so a delegated run is recognizable.
const STUB: &str = "process.stdout.write(JSON.stringify(process.argv.slice(2)));";

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

/// A workspace with one new component.
fn workspace() -> TempDir {
    let dir = TempDir::new().unwrap();
    let root = dir.path();
    write(&root.join("bin/bit.js"), STUB);
    fs::create_dir_all(root.join("home")).unwrap();
    fs::create_dir_all(root.join("ws/.bit/objects")).unwrap();
    write(&root.join("ws/.bit/index.json"), "[]");
    write(
        &root.join("ws/workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my.scope" } }"#,
    );
    write(
        &root.join("ws/.bit/scope.json"),
        r#"{ "name": "local", "lanes": { "current": "main" } }"#,
    );
    write(
        &root.join("ws/.bitmap"),
        r#"{ "alpha": { "name": "alpha", "scope": "", "version": "", "mainFile": "index.ts", "rootDir": "alpha" }, "$schema-version": "17.0.0" }"#,
    );
    write(&root.join("ws/alpha/index.ts"), "export const a = 1;\n");
    dir
}

fn bit(dir: &TempDir, cwd: &Path, args: &[&str], env: &[(&str, &str)]) -> Output {
    let home = dir.path().join("home");
    let mut command = Command::new(env!("CARGO_BIN_EXE_bit"));
    command
        .current_dir(cwd)
        .args(args)
        .env("BIT_NODE_CLI", dir.path().join("bin/bit.js"))
        .env("HOME", &home)
        .env("USERPROFILE", &home)
        .env("BIT_GLOBALS_DIR", dir.path().join("globals"))
        .env("BIT_NATIVE_TRACE", "1")
        .env_remove("BIT_NATIVE")
        .env_remove("BIT_FEATURES")
        .env_remove("BIT_CONFIG_GIT_PATH");
    for (key, value) in env {
        command.env(key, value);
    }
    command.output().unwrap()
}

/// Delegated with `args`, for the traced reason.
fn declined(output: &Output, args: &str, reason: &str) {
    assert_eq!(String::from_utf8_lossy(&output.stdout), args);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("`diff` declined") && stderr.contains(reason), "{stderr}");
}

#[cfg(not(windows))]
#[test]
fn other_arguments_decline() {
    let dir = workspace();
    let root = dir.path().join("ws");
    declined(&bit(&dir, &root, &["diff"], &[]), r#"["diff"]"#, "needs the Node.js CLI's own Node");
    let output = bit(&dir, &root, &["diff", "alpha", "0.0.1", "--json"], &[]);
    declined(&output, r#"["diff","alpha","0.0.1","--json"]"#, "outside the native diff grammar");
}

#[cfg(not(windows))]
#[test]
fn patterns_outside_the_grammar_decline() {
    let dir = workspace();
    let root = dir.path().join("ws");
    let output = bit(&dir, &root, &["diff", "Alpha", "--json"], &[]);
    declined(&output, r#"["diff","Alpha","--json"]"#, "native grammar");
    let output = bit(&dir, &root, &["diff", "missing", "-j"], &[]);
    declined(&output, r#"["diff","missing","-j"]"#, "exactly one component");
}

#[cfg(not(windows))]
#[test]
fn a_configured_git_executable_declines() {
    let dir = workspace();
    let root = dir.path().join("ws");
    let output = bit(&dir, &root, &["diff", "--json"], &[("BIT_CONFIG_GIT_PATH", "/opt/git")]);
    declined(&output, r#"["diff","--json"]"#, "configured git executable");
}

#[cfg(not(windows))]
#[test]
fn outside_a_workspace_declines() {
    let dir = workspace();
    let output = bit(&dir, dir.path(), &["diff", "--json"], &[]);
    declined(&output, r#"["diff","--json"]"#, "not inside a workspace");
}

#[cfg(windows)]
#[test]
fn windows_declines() {
    let dir = workspace();
    let root = dir.path().join("ws");
    let output = bit(&dir, &root, &["diff", "--json"], &[]);
    declined(&output, r#"["diff","--json"]"#, "Windows directory order");
}
