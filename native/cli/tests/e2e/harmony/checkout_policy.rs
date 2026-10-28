//! Checkout's workspace policy updates follow the published Node CLI.

use crate::helper::{Helper, config};
use serde_json::json;
use std::{ffi::OsStr, fs, path::PathBuf};

fn node(helper: &Helper, command: &str) {
    let result = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(result.status.success(), "{command}: {} {}", result.stdout, result.stderr);
}

fn source() -> (Helper, PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'first';\n");
    helper.add_component_bar_foo();
    node(&helper, "tag --ignore-issues * --message first");
    crate::helper::remote::publish(&helper);
    let before = helper.clone_workspace();

    helper.create_component_bar_foo("module.exports = require('lodash.get');\n");
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({"policy":{"dependencies":{"lodash.get":"^4.4.2"}}}),
    );
    helper.npm_add_fake_package("lodash.get", "4.4.2", false);
    helper.output_file("node_modules/lodash.get/index.js", "module.exports = () => 1;\n");
    node(&helper, "tag --ignore-issues * --message second");
    crate::helper::remote::publish(&helper);
    (helper, before)
}

fn set_policy(helper: &Helper, version: &str) {
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({"policy":{"dependencies":{"lodash.get":version}}}),
    );
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let text = fs::read_to_string(&path).unwrap();
    fs::write(&path, format!("// retain checkout policy comment\n{text}")).unwrap();
}

fn stable_output(output: &str) -> String {
    output
        .lines()
        .map(|line| {
            line.split_once(" (completed in ")
                .map_or_else(|| line.to_owned(), |(label, _)| format!("{label} (completed)"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn checkout_head_projects_workspace_policy_updates_and_conflicts() {
    let (helper, before) = source();
    for (workspace_version, strategy) in [
        ("^4.4.1", ""),
        ("^4.4.3", ""),
        ("4.4.1", ""),
        ("4.4.1", "--auto-merge-resolve theirs"),
        ("4.4.1", "--auto-merge-resolve ours"),
        ("5.0.0", ""),
    ] {
        helper.get_cloned_workspace(&before);
        set_policy(&helper, workspace_version);
        compare_policy(&helper, workspace_version, strategy);
    }
}

fn compare_policy(helper: &Helper, workspace_version: &str, strategy: &str) {
    let baseline = helper.clone_workspace();
    let command = format!("checkout head bar/foo -x {strategy}");
    let node = Helper::cmd_in_with(
        &baseline,
        &command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let native =
        Helper::cmd_in_with(&helper.scopes.local_path, &command, &[("CI", OsStr::new("1"))]);
    assert!(native.native, "{workspace_version} {strategy}: {}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{workspace_version} {strategy}");
    assert_eq!(
        stable_output(&native.stdout),
        stable_output(&node.stdout),
        "{workspace_version} {strategy}",
    );
    assert_eq!(native.stderr, node.stderr, "{workspace_version} {strategy}");
    for file in ["workspace.jsonc", ".bitmap", "bar/foo.js"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(file)).unwrap(),
            fs::read(baseline.join(file)).unwrap(),
            "{workspace_version} {strategy}: {file}",
        );
    }
}

#[test]
fn checkout_policy_update_preserves_interior_block_and_trailing_jsonc_comments() {
    let (helper, before) = source();
    helper.get_cloned_workspace(&before);
    set_policy(&helper, "^4.4.1");
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let text = fs::read_to_string(&path)
        .unwrap()
        .replace(
            r#""policy": {"#,
            "\"policy\": { // policy header\n        /* nested policy comment */",
        )
        .replace(r#""lodash.get": "^4.4.1""#, r#""lodash.get": "^4.4.1", /* version tail */"#);
    fs::write(&path, format!("{text}// after document\n")).unwrap();
    compare_policy(&helper, "^4.4.1", "");
    let after = fs::read_to_string(path).unwrap();
    for comment in ["policy header", "nested policy comment", "version tail", "after document"] {
        assert!(after.contains(comment), "missing {comment}: {after}");
    }
}
