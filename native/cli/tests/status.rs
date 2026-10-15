//! `bit status` inputs the native command leaves to the Node.js CLI.

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
        .env("LANG", "en_US.UTF-8")
        .env_remove("LC_ALL")
        .env_remove("LC_MESSAGES")
        .env("BIT_NATIVE_TRACE", "1")
        .env_remove("BIT_NATIVE")
        .env_remove("BIT_FEATURES");
    for (key, value) in env {
        command.env(key, value);
    }
    command.output().unwrap()
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

fn stdout(output: &Output) -> String {
    String::from_utf8(output.stdout.clone()).unwrap()
}

/// Delegated, for the traced reason.
fn declined(output: &Output, reason: &str) {
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("`status` declined") && stderr.contains(reason), "{stderr}");
}

#[test]
fn other_flags_decline() {
    let dir = workspace();
    let root = dir.path().join("ws");
    for args in [&["s", "--json", "--strict"][..], &["status", "--lanes"], &["status", "-c"]] {
        let output = bit(&dir, &root, args, &[]);
        assert_eq!(stdout(&output), serde_json::to_string(args).unwrap());
        declined(&output, "flags outside the native `status` grammar");
    }
}

#[test]
fn outside_a_workspace_declines() {
    let dir = workspace();
    let output = bit(&dir, dir.path(), &["status", "--json"], &[]);
    assert_eq!(stdout(&output), r#"["status","--json"]"#);
    declined(&output, "not inside a workspace");
}

#[test]
fn locales_with_tailored_collation_decline() {
    let dir = workspace();
    let root = dir.path().join("ws");
    let output = bit(&dir, &root, &["status", "-j"], &[("LC_ALL", "da_DK.UTF-8")]);
    assert_eq!(stdout(&output), r#"["status","-j"]"#);
    declined(&output, "locale");
}

#[test]
fn configured_extensions_decline() {
    let dir = workspace();
    let root = dir.path().join("ws");
    write(
        &root.join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my.scope" }, "my.org/aspect": {} }"#,
    );
    let output = bit(&dir, &root, &["status", "--json"], &[]);
    assert_eq!(stdout(&output), r#"["status","--json"]"#);
    declined(&output, "statusContext");
}

/// Without the declines above, the fixture reaches fresh detection, which
/// needs the Node.js CLI's package: the stub has none. The report declines
/// before printing anything, like `--json`.
#[test]
fn fresh_detection_needs_the_node_cli_package() {
    let dir = workspace();
    let root = dir.path().join("ws");
    for args in [&["status", "--json"][..], &["status"], &["s", "-w", "--strict"]] {
        let output = bit(&dir, &root, args, &[]);
        assert_eq!(stdout(&output), serde_json::to_string(args).unwrap());
        declined(&output, "needs the Node.js CLI's own Node");
    }
}

/// Without the trace, a declined native command warns on stderr that it runs
/// on the Node.js CLI; stdout stays the Node.js CLI's own.
#[test]
fn a_declined_command_warns_that_it_runs_on_node() {
    let dir = workspace();
    let root = dir.path().join("ws");
    let untraced = [("BIT_NATIVE_TRACE", "0")];
    let output = bit(&dir, &root, &["status", "--lanes"], &untraced);
    assert_eq!(stdout(&output), r#"["status","--lanes"]"#);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(
        stderr.trim_end(),
        "\u{26A0} bit-native: `status` runs on the Node.js CLI: flags outside the native `status` grammar",
    );
    let quiet = bit(
        &dir,
        &root,
        &["status", "--lanes"],
        &[("BIT_NATIVE_TRACE", "0"), ("BIT_NATIVE_QUIET", "1")],
    );
    assert!(quiet.stderr.is_empty(), "{}", String::from_utf8_lossy(&quiet.stderr));
    let help = bit(&dir, &root, &["status", "--help"], &untraced);
    assert!(help.stderr.is_empty(), "{}", String::from_utf8_lossy(&help.stderr));
}
