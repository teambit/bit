//! Port of `e2e/functionalities/dynamic-namespaces.e2e.ts` for multi-level component namespaces ([`VERY_LONG_NAME`], [`setup_multi_level`]).
//!
//! Covers deeply nested component IDs across `cat-component`, `status`, `list`, `show`, `import`, and ID conflict detection.

use crate::helper::{FOO_FIXTURE, Helper, parse};

/// Deeply nested multi-level component ID used across dynamic namespace tests.
const VERY_LONG_NAME: &str = "this/is/a/very/large/name/for/a/component";

/// Initializes a workspace with `bar/foo.js` added and tagged under [`VERY_LONG_NAME`].
fn setup_multi_level() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    let add_out = helper.run(&format!("add bar -i {VERY_LONG_NAME}"));
    assert!(add_out.contains("added"), "{add_out}");
    helper.run("tag");
    helper
}

/// Verifies that `cat-component` records [`VERY_LONG_NAME`] without legacy `box` metadata ([`setup_multi_level`]).
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

/// Verifies `bit status` lists [`VERY_LONG_NAME`] under staged components ([`setup_multi_level`], [`Helper`], [`FOO_FIXTURE`]).
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

/// Initializes a workspace where a local component shares the same scope-qualified ID as a remote component.
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
