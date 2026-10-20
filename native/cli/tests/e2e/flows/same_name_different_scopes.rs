//! `e2e/flows/same-name-different-scopes.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, parse};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

fn create_bare_scope(helper: &Helper, name: &str) -> PathBuf {
    let path = helper.scopes.e2e_dir.join(name);
    crate::helper::setup::copy_dir(&crate::helper::setup::shared().bare_scope_template, &path);
    crate::helper::config::update_scope_json(&path.join("scope.json"), |scope| {
        scope.insert("name".into(), json!(name));
    });
    path
}

fn add_remote(helper: &Helper, name: &str, path: &Path) {
    let url = format!("file://{}", path.display());
    crate::helper::config::update_scope_json(
        &helper.scopes.local_path.join(".bit/scope.json"),
        |scope| {
            let remotes = scope
                .entry("remotes")
                .or_insert_with(|| json!({}));
            remotes[name] = Value::String(url);
        },
    );
}

fn read_bitmap(helper: &Helper) -> Value {
    let text = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    parse(&text[text.find('{').unwrap()..])
}

/// two components with the same name but different scope-name › importing objects from another scope › bit status should show the component as new
#[test]
fn importing_objects_from_another_scope_status_new() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let other_name = format!("{}-other", helper.scopes.remote);
    let other_path = create_bare_scope(&helper, &other_name);
    add_remote(&helper, &other_name, &other_path);

    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native(&format!("scope set {other_name} bar/foo"));
    helper.run("tag bar/foo");
    helper.run("tag --unmodified --ver 0.0.2");
    helper.run(&format!("export {other_name}/bar/foo"));

    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    add_remote(&helper, &other_name, &other_path);
    helper.run(&format!("import {other_name}/bar/foo --objects"));

    let status = parse(&helper.native("status --json"));
    let new_components = status["newComponents"].as_array().unwrap();
    assert_eq!(new_components.len(), 1, "expected 1 new component");
}

/// two components with the same name but different scope-name › importing and using both in the same workspace › bitmap should have both and the keys should contain the scope-name to differentiate
#[test]
fn importing_and_using_both_bitmap_keys() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let other_name = format!("{}-other", helper.scopes.remote);
    let other_path = create_bare_scope(&helper, &other_name);
    add_remote(&helper, &other_name, &other_path);

    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native(&format!("scope set {other_name} bar/foo"));
    helper.run("tag bar/foo");
    helper.run(&format!("export {other_name}/bar/foo"));

    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    add_remote(&helper, &other_name, &other_path);
    helper.run(&format!("import {other_name}/bar/foo"));

    let bitmap = read_bitmap(&helper);
    let key1 = format!("{}/bar/foo", helper.scopes.remote);
    let key2 = format!("{other_name}/bar/foo");
    assert!(bitmap.get(&key1).is_some(), "missing {key1} in bitmap");
    assert!(bitmap.get(&key2).is_some(), "missing {key2} in bitmap");
}

/// two components with the same name but different scope-name › importing and using both in the same workspace › bit status should show the new component correctly
#[test]
fn importing_and_using_both_status_new() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let other_name = format!("{}-other", helper.scopes.remote);
    let other_path = create_bare_scope(&helper, &other_name);
    add_remote(&helper, &other_name, &other_path);

    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native(&format!("scope set {other_name} bar/foo"));
    helper.run("tag bar/foo");
    helper.run(&format!("export {other_name}/bar/foo"));

    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    add_remote(&helper, &other_name, &other_path);
    helper.run(&format!("import {other_name}/bar/foo"));

    let status = parse(&helper.native("status --json"));
    let new_components = status["newComponents"].as_array().unwrap();
    assert_eq!(new_components.len(), 1);
    assert_eq!(new_components[0].as_str().unwrap(), format!("{}/bar/foo", helper.scopes.remote));
}

/// two components with the same name but different scope-name › importing and using both in the same workspace › having both components as imported › the workspace should be fine and not throw errors
#[test]
fn both_components_imported_clean_workspace() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let other_name = format!("{}-other", helper.scopes.remote);
    let other_path = create_bare_scope(&helper, &other_name);
    add_remote(&helper, &other_name, &other_path);

    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native(&format!("scope set {other_name} bar/foo"));
    helper.run("tag bar/foo");
    helper.run(&format!("export {other_name}/bar/foo"));

    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    add_remote(&helper, &other_name, &other_path);
    helper.run(&format!("import {other_name}/bar/foo"));

    helper.run("tag bar/foo");
    helper.run("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    add_remote(&helper, &other_name, &other_path);
    helper.run(&format!("import {}/bar/foo {other_name}/bar/foo -x", helper.scopes.remote));

    let status = parse(&helper.native("status --json"));
    assert!(
        status["newComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

/// two components with the same name but different scope-name › creating two new components with the same name in the same workspace › bit list should list them both
#[test]
fn creating_two_new_components_list() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let other_name = format!("{}-other", helper.scopes.remote);
    let other_path = create_bare_scope(&helper, &other_name);
    add_remote(&helper, &other_name, &other_path);

    helper.output_file("scope1/comp1/index.ts", "export const a = 1;");
    helper.output_file("scope2/comp1/index.ts", "export const b = 2;");
    helper.run("add scope1/comp1 --id comp1");
    helper.run(&format!("add scope2/comp1 --id comp1 --scope {other_name}"));

    let list = parse(&helper.native("list --json"));
    let array = list.as_array().unwrap();
    assert_eq!(array.len(), 2, "expected 2 components in list: {array:?}");
}

/// two components with the same name but different scope-name › creating two new components with the same name in the same workspace › tagging them both › should tag both of them
#[test]
fn creating_two_new_components_tag_both() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let other_name = format!("{}-other", helper.scopes.remote);
    let other_path = create_bare_scope(&helper, &other_name);
    add_remote(&helper, &other_name, &other_path);

    helper.output_file("scope1/comp1/index.ts", "export const a = 1;");
    helper.output_file("scope2/comp1/index.ts", "export const b = 2;");
    helper.run("add scope1/comp1 --id comp1");
    helper.run(&format!("add scope2/comp1 --id comp1 --scope {other_name}"));

    helper.run("tag");
    let status = parse(&helper.native("status --json"));
    let staged = status["stagedComponents"].as_array().unwrap();
    assert_eq!(staged.len(), 2, "expected 2 staged components: {staged:?}");
}

/// two components with the same name but different scope-name › creating two new components with the same name in the same workspace › tagging them both › should export with no errors
#[test]
fn creating_two_new_components_export_both() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let other_name = format!("{}-other", helper.scopes.remote);
    let other_path = create_bare_scope(&helper, &other_name);
    add_remote(&helper, &other_name, &other_path);

    helper.output_file("scope1/comp1/index.ts", "export const a = 1;");
    helper.output_file("scope2/comp1/index.ts", "export const b = 2;");
    helper.run("add scope1/comp1 --id comp1");
    helper.run(&format!("add scope2/comp1 --id comp1 --scope {other_name}"));

    helper.run("tag");
    helper.run("export");
}
