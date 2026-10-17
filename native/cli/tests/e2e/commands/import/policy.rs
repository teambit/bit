//! Import finalization updates the workspace policy using imported automatic dependencies.
use crate::helper::{
    Helper,
    config::{read_jsonc, set_workspace_key},
};
use serde_json::json;
use std::{ffi::OsStr, fs};

fn fixture() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = require('detected-package');");
    helper.add_component_bar_foo();
    helper.output_file(
        "node_modules/detected-package/package.json",
        r#"{"name":"detected-package","version":"1.2.0","main":"index.js"}"#,
    );
    helper.output_file("node_modules/detected-package/index.js", "module.exports = 1;");
    set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({"policy":{"dependencies":{"detected-package":"^1.2.0"}}}),
    );
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper
}

fn parity(version: &str, flags: &str) {
    let helper = fixture();
    set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({"policy":{"dependencies":{"detected-package":version}}}),
    );
    let command = format!("import {}/bar/foo -x {flags}", helper.scopes.remote);
    let copy = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{}{}", node.stdout, node.stderr);
    let expected = fs::read(helper.scopes.local_path.join("workspace.jsonc")).unwrap();
    let bitmap = read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    helper.get_cloned_workspace(&copy);
    let native = helper.native_run(&command);
    assert_eq!(native.status.code(), node.status.code());
    if flags.contains("--json") || flags.contains("-j") {
        assert_eq!(native.stdout, node.stdout);
    } else {
        assert_eq!(stable(&native.stdout), stable(&node.stdout));
    }
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(fs::read(helper.scopes.local_path.join("workspace.jsonc")).unwrap(), expected);
    assert_eq!(read_jsonc(&helper.scopes.local_path.join(".bitmap")), bitmap);
}

#[test]
fn imported_automatic_dependency_updates_workspace_range() {
    parity("^1.0.0", "");
}

#[test]
fn merge_ours_still_updates_the_imported_workspace_policy() {
    parity("^1.0.0", "--merge=ours");
}

#[test]
fn imported_automatic_dependency_writes_workspace_conflict() {
    parity("1.0.0", "");
}

pub(super) fn stable(text: &str) -> String {
    text.split_inclusive('\n')
        .fold(String::new(), |mut output, line| {
            if let Some((prefix, duration)) = line.split_once("(completed in")
                && let Some(end) = duration.find(')')
            {
                output.push_str(prefix);
                output.push_str("(completed in <duration>)");
                output.push_str(&duration[end + 1..]);
            } else {
                output.push_str(line);
            }
            output
        })
}

#[test]
fn json_import_updates_policy_without_loader_output() {
    parity("^1.0.0", "--json");
}

#[test]
fn verbose_import_matches_the_published_report() {
    parity("^1.0.0", "--verbose");
}

#[test]
fn installing_json_import_retains_published_result_shape() {
    let helper = super::exported_simple();
    let oracle = helper.clone_workspace();
    let command = format!("import {}/global/simple --json", helper.scopes.remote);
    let expected = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.native_run(&command);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(
        read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        read_jsonc(&oracle.join(".bitmap")),
    );
}
