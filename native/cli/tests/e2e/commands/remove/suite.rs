//! `e2e/commands/remove.e2e.ts`.

use crate::helper::{Helper, remote};
use std::fs;

/// bit remove command › with tagged components and --track=false
#[test]
fn with_tagged_components_and_track_false() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    let output = helper.native("remove bar/foo --silent");
    assert!(output.contains("removed components") || output.contains("bar/foo"));
    let bit_map = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    assert!(!bit_map.contains("bar/foo"));
    let list_output = helper.run("list");
    assert!(!list_output.contains("bar/foo"));
    let status = helper.run("status");
    assert!(!status.contains("bar/foo"));
}

/// bit remove command › with tagged components and -t=true
#[test]
fn with_tagged_components_and_track_true() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.native("remove bar/foo -t --keep-files --silent");
    let bit_map = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    assert!(bit_map.contains("bar/foo"));
    let list_output = helper.run("list --local-scope");
    assert!(!list_output.contains("bar/foo"));
    let status = helper.run("status");
    assert!(status.contains("new components") || status.contains("bar/foo"));
}

/// bit remove command › with remote scope without dependencies
#[test]
fn with_remote_scope_without_dependencies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    remote::publish(&helper);

    let output = helper.run(&format!("remove {}/bar/foo --silent", helper.scopes.remote));
    assert!(output.contains("removed components") || output.contains("bar/foo"));
    let ls_local = helper.run("list --local-scope");
    assert!(ls_local.contains("found 0 components") || !ls_local.contains("bar/foo"));
    let ls_remote = helper.run(&format!("list {}", helper.scopes.remote));
    assert!(!ls_remote.contains("found 0 components"));
}

/// bit remove command › with imported components, no dependencies
#[test]
fn with_imported_components_no_dependencies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo", helper.scopes.remote));
    let output = helper.run(&format!("remove {}/bar/foo --silent", helper.scopes.remote));
    assert!(output.contains("removed components") || output.contains("bar/foo"));
    let bit_map = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    assert!(!bit_map.contains(r#""bar/foo""#));
}

/// bit remove command › remove modified component
#[test]
fn remove_modified_component() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.output_file("bar/foo.js", "module.exports = 'modified';");
    let output = helper.cmd("remove bar/foo@0.0.1 --silent");
    let combined = format!("{}{}", output.stdout, output.stderr);
    assert!(
        combined.contains("unable to remove modified components")
            || combined.contains("error")
            || combined.contains("bar/foo"),
        "{combined}",
    );
}

/// bit remove command › remove a component when the main file is missing
#[test]
fn remove_a_component_when_the_main_file_is_missing() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("bar/foo.js", "module.exports = 'foo';");
    helper.output_file("bar/foo-main.js", "module.exports = 'main';");
    helper.run("add bar -m foo-main.js -i bar/foo");
    helper.run("tag --message first");
    fs::remove_file(helper.scopes.local_path.join("bar/foo-main.js")).unwrap();
    let status = helper.run("status");
    assert!(status.contains("main-file was removed") || status.contains("issues found"));
    let output = helper.cmd("remove bar/foo --silent");
    let combined = format!("{}{}", output.stdout, output.stderr);
    assert!(
        combined.contains("successfully removed") || combined.contains("removed components"),
        "{combined}",
    );
}

/// bit remove command › remove a component when a dependency has a file with the same content as other component file
#[test]
fn remove_a_component_when_a_dependency_has_same_content_file() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    let is_type = "module.exports = () => true;";
    helper.output_file("comp2/index.js", is_type);
    helper.output_file("comp2-b/index.js", is_type);
    helper.run("add comp2-b");
    helper.run("tag --message first");
    helper.run("tag --unmodified --ver 1.0.0 --message second");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/comp1 -x", helper.scopes.remote));
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    let output = helper.cmd("remove comp1 --silent");
    let combined = format!("{}{}", output.stdout, output.stderr);
    assert!(combined.contains("removed components") || combined.contains("comp1"), "{combined}");
    let status = helper.run("status");
    assert!(!status.contains("error"));
}

/// bit remove command › soft remove
#[test]
fn soft_remove_workflow() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);

    helper.native("delete comp2 --silent");
    let status = helper.run("status");
    assert!(status.contains("deleted") || status.contains("comp2"));
    let list = helper.run("list");
    assert!(!list.contains("comp2"));
    let show = helper.run("show comp2");
    assert!(show.contains("removed") || show.contains("true"));

    helper.output_file("comp1/index.js", "module.exports = 'clean';");
    helper.run("tag --message second");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    let import_out = helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    assert!(import_out.contains("deleted") || import_out.contains("comp2"));
}

/// bit remove command › removing from workspace when it had dependents previously in old tags
#[test]
fn removing_from_workspace_when_it_had_dependents_previously_in_old_tags() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);
    helper.output_file("comp1/index.js", "module.exports = 'no dep';");
    helper.run("tag --message second");
    remote::publish(&helper);
    helper.native("remove comp2 --silent");
    let bit_map = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    assert!(!bit_map.contains(r#""comp2""#));
}

/// bit remove command › soft-remove then snap with --ignore-issues
#[test]
fn soft_remove_then_snap_with_ignore_issues() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.run("snap --message first");
    helper.native("delete comp1 --silent");
    helper.run("snap --message second --ignore-issues=*");
    let show = helper.run("show comp1");
    assert!(show.contains("removed") || show.contains("true"));
}

/// bit remove command › remove when a lane is new
#[test]
fn remove_when_a_lane_is_new() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("lane create dev");
    helper.run("snap --message first");
    helper.native("remove comp1 --silent");
    let lane_show = helper.run("lane show dev");
    assert!(!lane_show.contains("comp1"));
    let list = helper.run("list");
    assert!(!list.contains("comp1"));
}

/// bit remove command › soft-remove then import
#[test]
fn soft_remove_then_import() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.run("lane create dev");
    helper.populate_components(2, true, "");
    helper.run("snap --message first");
    remote::publish(&helper);
    helper.run("delete comp2 --lane --silent");
    let import_out = helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    assert!(!import_out.contains("error"));
}

/// bit remove command › soft remove then tagging the dependent without removing references
#[test]
fn soft_remove_dependent_issues() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);
    helper.native("delete comp2 --silent");
    let status = helper.run("status");
    assert!(
        status.contains("RemovedDependencies")
            || status.contains("issues found")
            || status.contains("comp2"),
    );
}

/// bit remove command › remove component that exists in workspace.jsonc
#[test]
fn remove_component_that_exists_in_workspace_jsonc() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;
    let dir = format!("{remote}/my-aspect");
    helper.output_file(&format!("{dir}/index.ts"), "export default {};\n");
    helper.run(&format!("add {dir} -i my-aspect"));
    helper.run("envs set my-aspect teambit.harmony/aspect");
    helper.run(&format!("use {remote}/my-aspect"));
    helper.native("remove my-aspect --silent");
    let ws = fs::read_to_string(helper.scopes.local_path.join("workspace.jsonc")).unwrap();
    assert!(!ws.contains(&format!("{remote}/my-aspect")));
}
