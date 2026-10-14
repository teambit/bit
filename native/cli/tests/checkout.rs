//! `bit checkout` inputs the native command leaves to the Node.js CLI, each
//! for its traced reason.

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

fn bit(dir: &TempDir, cwd: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_bit"))
        .current_dir(cwd)
        .args(args)
        .env("BIT_NODE_CLI", dir.path().join("bin/bit.js"))
        .env("HOME", dir.path())
        .env("USERPROFILE", dir.path())
        .env("BIT_GLOBALS_DIR", dir.path().join("globals"))
        .env("BIT_NATIVE_TRACE", "1")
        .env_remove("BIT_NATIVE")
        .output()
        .unwrap()
}

/// Delegated with `args`, for the traced reason.
fn declined(output: &Output, args: &str, reason: &str) {
    assert_eq!(String::from_utf8_lossy(&output.stdout), args);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("`checkout` declined") && stderr.contains(reason), "{stderr}");
}

fn setup() -> TempDir {
    let dir = TempDir::new().unwrap();
    write(&dir.path().join("bin/bit.js"), STUB);
    write(
        &dir.path().join("ws/workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my.scope" } }"#,
    );
    dir
}

#[test]
fn input_outside_the_native_grammar_declines() {
    let dir = setup();
    let root = dir.path().join("ws");
    let grammar = "outside the native checkout grammar";
    declined(&bit(&dir, &root, &["checkout", "head"]), r#"["checkout","head"]"#, grammar);
    declined(
        &bit(&dir, &root, &["U", "head", "-x", "--all"]),
        r#"["U","head","-x","--all"]"#,
        grammar,
    );
    declined(&bit(&dir, &root, &["checkout", "1.0", "-x"]), r#"["checkout","1.0","-x"]"#, grammar);
    let output = bit(&dir, &root, &["checkout", "head", "-x", "--json"]);
    declined(&output, r#"["checkout","head","-x","--json"]"#, grammar);
}

#[test]
fn checkout_main_declines() {
    let dir = setup();
    let output = bit(&dir, &dir.path().join("ws"), &["checkout", "main", "-x", "--all"]);
    declined(&output, r#"["checkout","main","-x","--all"]"#, "checkout main progress");
}

#[test]
fn outside_a_workspace_declines() {
    let dir = setup();
    let output = bit(&dir, dir.path(), &["checkout", "head", "-x", "--all"]);
    declined(&output, r#"["checkout","head","-x","--all"]"#, "outside the native checkout grammar");
    let output = bit(&dir, dir.path(), &["checkout", "reset", "-x", "--all"]);
    declined(&output, r#"["checkout","reset","-x","--all"]"#, "not inside a workspace");
}

/// `commandPrepare` carries the Node.js CLI's dependency facts, which need
/// its `@teambit/bit` package: the stub has none.
#[test]
fn planning_needs_the_node_cli_package() {
    let dir = setup();
    let output = bit(&dir, &dir.path().join("ws"), &["checkout", "reset", "-x", "--all"]);
    declined(&output, r#"["checkout","reset","-x","--all"]"#, "needs the Node.js CLI's own Node");
}
