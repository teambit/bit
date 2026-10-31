//! `e2e/functionalities/dynamic-namespaces.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, parse};

const VERY_LONG_NAME: &str = "this/is/a/very/large/name/for/a/component";

fn setup_multi_level() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    let add_out = helper.run(&format!("add bar -i {VERY_LONG_NAME}"));
    assert!(add_out.contains("added"), "{add_out}");
    helper.run("tag");
    helper
}

/// dynamic namespaces › multi-level namespace. using name "${veryLongName}" › should save the component correctly on the model
#[test]
fn should_save_the_component_correctly_on_the_model() {
    let helper = setup_multi_level();
    let output = helper.run(&format!("cat-component {VERY_LONG_NAME} --json"));
    let json_start = output.find('{').unwrap();
    let cat = parse(&output[json_start..]);
    assert_eq!(cat["name"], VERY_LONG_NAME);
    assert!(cat.get("box").is_none());
}

/// dynamic namespaces › multi-level namespace. using name "${veryLongName}" › bit status should show the component as staged
#[test]
fn status_should_show_the_component_as_staged() {
    let helper = setup_multi_level();
    let output = helper.native("status");
    assert!(output.contains("staged"), "{output}");
    assert!(output.contains(VERY_LONG_NAME), "{output}");
}

/// dynamic namespaces › multi-level namespace. using name "${veryLongName}" › bit list should list the component
#[test]
fn list_should_list_the_component() {
    let helper = setup_multi_level();
    let output = helper.native("list --local-scope");
    assert!(output.contains(VERY_LONG_NAME), "{output}");
}

/// dynamic namespaces › multi-level namespace. using name "${veryLongName}" › bit show should show the component with the correct name
#[test]
fn show_should_show_the_component_with_the_correct_name() {
    let helper = setup_multi_level();
    let output = helper.run(&format!("show {VERY_LONG_NAME} --json --legacy"));
    let json_start = output.find('{').unwrap();
    let show = parse(&output[json_start..]);
    assert_eq!(show["name"], VERY_LONG_NAME);
}

/// dynamic namespaces › multi-level namespace. using name "${veryLongName}" › after import › should create the directories according to the multiple namespaces
#[test]
fn after_import_should_create_the_directories() {
    let helper = setup_multi_level();
    helper.run("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/{VERY_LONG_NAME}", helper.scopes.remote));
    let file = helper.scopes.local_path
        .join(&helper.scopes.remote)
        .join(VERY_LONG_NAME)
        .join("foo.js");
    assert!(file.is_file(), "expected file at {}", file.display());
}

fn setup_conflict() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("foo/foo.js", FOO_FIXTURE);
    helper.run("add foo -i foo");
    helper.run("tag");
    helper.run("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.output_file("bar/foo.js", FOO_FIXTURE);
    helper.run(&format!("add bar -i {}/foo", helper.scopes.remote));
    helper
}

/// dynamic namespaces › import a component with same id string as a local different component › should throw an error and not allow the import
#[test]
fn import_same_id_string_as_local_different_component() {
    let helper = setup_conflict();
    let run = helper.cmd(&format!("import {}/foo", helper.scopes.remote));
    assert!(!run.status.success());
    let output = format!("{}{}", run.stdout, run.stderr);
    assert!(output.contains("unable to import") || output.contains("already exists"), "{output}");
}

/// dynamic namespaces › import a component with same id string as a local different component › should throw an error also after tagging
#[test]
fn import_same_id_string_also_after_tagging() {
    let helper = setup_conflict();
    helper.run("tag");
    let run = helper.cmd(&format!("import {}/foo", helper.scopes.remote));
    assert!(!run.status.success());
    let output = format!("{}{}", run.stdout, run.stderr);
    assert!(output.contains("unable to import") || output.contains("already exists"), "{output}");
}
