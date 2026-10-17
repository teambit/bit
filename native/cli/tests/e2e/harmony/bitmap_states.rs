//! Status sections derived from durable bitmap state.

use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use std::ffi::OsStr;

fn parity(helper: &Helper) -> serde_json::Value {
    let copy = helper.clone_workspace();
    let native = helper.native_run("status --json");
    let node = Helper::cmd_in_with(&copy, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    let native_json = parse(&native.stdout);
    assert_eq!(native_json, parse(&node.stdout));
    native_json
}

fn text_parity(helper: &Helper) {
    let copy = helper.clone_workspace();
    let native = helper.native_run("status");
    let node = Helper::cmd_in_with(&copy, "status", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn local_only_component_is_reported_without_losing_its_other_status() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("local-only set bar/foo");
    let status = parity(&helper);
    assert_eq!(status["localOnly"], serde_json::json!(["my-scope/bar/foo"]));
    assert_eq!(status["newComponents"], serde_json::json!(["my-scope/bar/foo"]));
    text_parity(&helper);
}

#[test]
fn soft_tagged_component_is_reported_without_a_version() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag --soft bar/foo");
    let status = parity(&helper);
    assert_eq!(status["softTaggedComponents"], serde_json::json!(["my-scope/bar/foo"]));
    text_parity(&helper);
}

#[test]
fn locally_soft_removed_component_is_reported() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.run("export bar/foo");
    helper.run("delete bar/foo --silent");
    let status = parity(&helper);
    assert_eq!(
        status["locallySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    text_parity(&helper);
}

#[test]
fn a_dependent_reports_issues_after_its_dependency_is_soft_removed() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    helper.run("export");
    helper.run("delete comp2 --silent");
    let status = parity(&helper);
    assert_eq!(
        status["locallySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert!(
        !status["componentsWithIssues"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    text_parity(&helper);
}

#[test]
fn a_scoped_component_without_local_objects_is_pending_import() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = config::read_jsonc(&bitmap_path);
    let entry = bitmap
        .as_object_mut()
        .unwrap()
        .iter_mut()
        .find(|(key, _)| *key != "$schema-version")
        .unwrap()
        .1;
    entry["scope"] = serde_json::json!("my-scope");
    entry["version"] = serde_json::json!("0.0.1");
    config::write_json(&bitmap_path, &bitmap, b"    ");

    let status = parity(&helper);
    assert_eq!(status["importPendingComponents"], serde_json::json!(["my-scope/bar/foo"]));
    assert_eq!(status["invalidComponents"][0]["error"]["name"], "ComponentsPendingImport");
    text_parity(&helper);
}

#[test]
fn an_imported_component_deleted_on_the_remote_is_reported() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    helper.run("export");
    helper.run("delete comp2 --silent");
    helper.output_file("comp1/index.js", "");
    helper.tag_without_build("", "");
    helper.run("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));

    let status = parity(&helper);
    assert_eq!(
        status["remotelySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    text_parity(&helper);
}
