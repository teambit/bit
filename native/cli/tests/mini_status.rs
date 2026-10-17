//! Native `bit mini-status --json` on a workspace the Rust status engine owns,
//! and its declines to the Node.js CLI.

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};
use tempfile::TempDir;

/// Echoes its arguments, so a delegated run is recognizable.
const STUB: &str = "process.stdout.write(JSON.stringify(process.argv.slice(2)));";

struct Workspace {
    dir: TempDir,
}

impl Workspace {
    /// Two new components; the second has a nested `.gitignore`.
    fn new() -> Self {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        write(&root.join("bin/bit.js"), STUB);
        fs::create_dir_all(root.join("home")).unwrap();
        fs::create_dir_all(root.join("ws/.bit/objects")).unwrap();
        write(
            &root.join("ws/workspace.jsonc"),
            r#"{ "teambit.workspace/workspace": { "defaultScope": "my.scope" } }"#,
        );
        write(&root.join("ws/.bit/scope.json"), r#"{ "lanes": { "current": "main" } }"#);
        write(
            &root.join("ws/.bitmap"),
            r#"{
  "alpha": { "name": "alpha", "scope": "", "version": "", "mainFile": "index.ts", "rootDir": "comps/alpha" },
  "beta": { "name": "beta", "scope": "", "version": "", "mainFile": "index.ts", "rootDir": "comps/beta" },
  "$schema-version": "17.0.0"
}"#,
        );
        write(&root.join("ws/comps/alpha/index.ts"), "export const a = 1;\n");
        write(&root.join("ws/comps/beta/index.ts"), "export const b = 1;\n");
        write(&root.join("ws/comps/beta/docs/.gitignore"), "*.log\n!keep.log\n");
        write(&root.join("ws/comps/beta/docs/a.log"), "log\n");
        Self { dir }
    }

    fn root(&self) -> PathBuf {
        self.dir.path().join("ws")
    }

    fn bit(&self, cwd: &Path, args: &[&str]) -> Output {
        let home = self.dir.path().join("home");
        Command::new(env!("CARGO_BIN_EXE_bit"))
            .current_dir(cwd)
            .args(args)
            .env("BIT_NODE_CLI", self.dir.path().join("bin/bit.js"))
            .env("HOME", &home)
            .env("USERPROFILE", &home)
            .env_remove("BIT_NATIVE")
            .env_remove("BIT_NATIVE_TRACE")
            .output()
            .unwrap()
    }
}

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

fn stdout(output: &Output) -> String {
    String::from_utf8(output.stdout.clone()).unwrap()
}

#[test]
fn reports_new_components_natively() {
    let workspace = Workspace::new();
    let output = workspace.bit(&workspace.root().join("comps/beta"), &["ms", "--json"]);
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    assert_eq!(
        stdout(&output),
        "{\n  \"modified\": [],\n  \"newComps\": [\n    \"my.scope/alpha\",\n    \"my.scope/beta\"\n  ],\n  \"compWithIssues\": []\n}",
    );
    let history = fs::read_to_string(workspace.root().join(".bit/command-history")).unwrap();
    let lines: Vec<_> = history.lines().collect();
    assert_eq!(lines.len(), 2, "{history}");
    assert!(lines[0].ends_with("ms --json, started"), "{history}");
    assert!(lines[1].ends_with("ms --json, succeeded"), "{history}");
}

#[test]
fn reports_without_flags_natively() {
    let workspace = Workspace::new();
    let output = workspace.bit(&workspace.root(), &["mini-status"]);
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    assert_eq!(
        stdout(&output),
        "- running command \"mini-status\"...\nmodified components (files only):\n<none>\n\nnew components:\nmy.scope/alpha\nmy.scope/beta\n",
    );
}

#[test]
fn other_flags_decline() {
    let workspace = Workspace::new();
    let output = workspace.bit(&workspace.root(), &["mini-status", "--show-issues"]);
    assert_eq!(stdout(&output), r#"["mini-status","--show-issues"]"#);
    let output = workspace.bit(&workspace.root(), &["ms", "--json", "alpha"]);
    assert_eq!(stdout(&output), r#"["ms","--json","alpha"]"#);
}

#[test]
fn mini_inventory_does_not_load_harmony_aspects() {
    let workspace = Workspace::new();
    write(
        &workspace.root().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my.scope" }, "my.org/aspect": {} }"#,
    );
    let output = workspace.bit(&workspace.root(), &["ms", "-j"]);
    let result: serde_json::Value = serde_json::from_str(&stdout(&output)).unwrap();
    assert_eq!(result["newComps"], serde_json::json!(["my.scope/alpha", "my.scope/beta"]));
    assert_eq!(result["modified"], serde_json::json!([]));
    assert_eq!(result["compWithIssues"], serde_json::json!([]));
}

#[test]
fn outside_a_workspace_declines() {
    let workspace = Workspace::new();
    let output = workspace.bit(workspace.dir.path(), &["ms", "--json"]);
    assert_eq!(stdout(&output), r#"["ms","--json"]"#);
}
