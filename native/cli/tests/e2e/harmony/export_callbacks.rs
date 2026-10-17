//! Export retains configured providers across remote persistence, package linking and hooks.
mod remote;
use crate::helper::{Helper, config};
use serde_json::json;
use std::{ffi::OsStr, fs};

fn node(helper: &Helper, command: &str) {
    let result = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(result.status.success(), "{command}: {} {}", result.stdout, result.stderr);
}
fn workspace() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'export callback';\n");
    helper.add_component_bar_foo();
    let id = format!("{}/env/export", helper.scopes.remote);
    let source = include_str!("export_callbacks/aspect.cjs");
    helper.output_file("export-env/index.js", source);
    helper.run("add export-env -i env/export");
    config::set_component_env(&helper.scopes.local_path, "env/export", "teambit.envs/env");
    helper.run("link");
    helper.output_file("export-env/dist/index.js", source);
    node(&helper, "tag env/export -m environment");
    config::set_component_env(&helper.scopes.local_path, "bar/foo", &id);
    config::set_workspace_key(&helper.scopes.local_path, &id, json!({}));
    node(&helper, "tag bar/foo -m component");
    helper.output_file("export-active", "active");
    helper
}

fn parity(mode: &str) {
    let helper = workspace();
    if matches!(mode, "package" | "post") {
        helper.output_file(&format!("export-{mode}-fails"), "fail");
    }
    if mode == "lane" {
        prepare_lane(&helper);
    }
    let remote_server = (!cfg!(unix) || !mode.is_empty()).then(|| remote::start(&helper));
    let command = if mode == "json" { "export --json" } else { "export --verbose" };
    let oracle = helper.clone_workspace();
    let native = helper.clone_workspace();
    let backup = helper.clone_remote_scope();
    let mut environment = vec![("BIT_CONFIG_USER_TOKEN", OsStr::new("export-token"))];
    if let Some(server) = &remote_server {
        environment.push(("BIT_CONFIG_SYMPHONY_URL", OsStr::new(&server.url)));
    }
    let mut node_environment = environment.clone();
    node_environment.push(("BIT_NATIVE", OsStr::new("off")));
    let expected = Helper::cmd_in_with(&oracle, command, &node_environment);
    let remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&backup);
    let actual = Helper::cmd_in_with(&native, command, &environment);
    super::export_hub::comparison::runs(&actual, &expected, &[], true);
    assert_status(mode, &actual, &expected);
    assert_shared_host(mode, &actual);
    super::export_hub::comparison::controls(&native, &oracle);
    super::export_hub::comparison::remote_objects(&helper.scopes.remote_path, &remote);
    assert_eq!(
        fs::read(native.join("export-events")).ok(),
        fs::read(oracle.join("export-events")).ok(),
    );
    let package = format!("node_modules/@{}/bar.foo/package.json", helper.scopes.remote);
    assert_eq!(fs::read(native.join(&package)).ok(), fs::read(oracle.join(&package)).ok());
    assert_eq!(actual.stdout.matches("export provider startup").count(), 1);
}

#[test]
fn configured_environment_packages_and_post_export_match_node() {
    parity("");
}
#[test]
fn package_failure_preserves_persisted_remote_and_old_bitmap_like_node() {
    parity("package");
}
#[test]
fn post_export_failure_is_nonfatal_like_node() {
    parity("post");
}

fn prepare_lane(helper: &Helper) {
    helper.delete_path("export-active");
    crate::helper::remote::publish(helper);
    node(helper, "lane create dev");
    node(helper, "snap bar/foo --unmodified --message lane");
    helper.output_file("export-active", "active");
}
#[test]
fn post_export_receives_real_lane_classes_and_unversioned_ids() {
    parity("lane");
}
#[test]
fn configured_export_json_retains_published_class_serialization() {
    parity("json");
}

fn assert_status(mode: &str, actual: &crate::helper::Run, expected: &crate::helper::Run) {
    assert_eq!(
        actual.status.success(),
        mode != "package",
        "Node: {} {}\nRust: {} {}",
        expected.stdout,
        expected.stderr,
        actual.stdout,
        actual.stderr,
    );
}

fn assert_shared_host(mode: &str, actual: &crate::helper::Run) {
    if cfg!(unix) && mode.is_empty() {
        assert_eq!(actual.trace.matches("starting the JavaScript host").count(), 1);
        assert_eq!(actual.trace.matches("host exportFileAction took").count(), 2);
    }
}
