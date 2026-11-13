//! Port of `e2e/flows/sort-components-output.e2e.ts` for alphabetical component output ordering ([`assert_sorted_alphabetically`], [`setup_populated_workspace`]).
//!
//! Ensures `bit status` and `bit list` preserve deterministic alphabetical ordering for new, staged, and deleted components.

use crate::helper::Helper;
use std::fs;

/// Asserts that `comp1`, `comp2`, and `comp3` appear in strictly ascending alphabetical order within `output` for [`after_adding_components_status_sorted`].
fn assert_sorted_alphabetically(output: &str) {
    let p1 = output.find("comp1").expect("comp1 in output");
    let p2 = output.find("comp2").expect("comp2 in output");
    let p3 = output.find("comp3").expect("comp3 in output");
    assert!(p1 < p2, "expected comp1 before comp2: {p1} vs {p2} in:\n{output}");
    assert!(p2 < p3, "expected comp2 before comp3: {p2} vs {p3} in:\n{output}");
}

/// Initializes a workspace with a remote scope and populates `comp1`, `comp2`, and `comp3`.
fn setup_populated_workspace() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper
}

/// Verifies `bit status` lists newly added components under `new components`.
/// basic flow with dependencies › after adding components › bit status › should show all of them under new components
#[test]
fn after_adding_components_status_new() {
    let helper = setup_populated_workspace();
    let output = helper.native("status");
    assert!(!output.contains("no new components"), "{output}");
    assert!(output.contains("new components"), "{output}");
}

/// Asserts that `bit status` sorts newly added components alphabetically ([`assert_sorted_alphabetically`]).
/// basic flow with dependencies › after adding components › bit status › should show new components sorted alphabetically
#[test]
fn after_adding_components_status_sorted() {
    let helper = setup_populated_workspace();
    let output = helper.native("status");
    assert_sorted_alphabetically(&output);
}

/// Verifies `bit list --local-scope` reports zero components before tagging ([`setup_populated_workspace`], [`Helper`], [`assert_sorted_alphabetically`]).
/// basic flow with dependencies › after adding components › bit list --local-scope should not show any component
#[test]
fn after_adding_components_list_empty() {
    let helper = setup_populated_workspace();
    let output = helper.native("list --local-scope");
    assert!(output.contains("found 0 components"), "{output}");
}

/// basic flow with dependencies › after adding components › after tagging the components › bit status › should show all of them under staged components
#[test]
fn after_tagging_components_status_staged() {
    let helper = setup_populated_workspace();
    helper.run("tag");
    let output = helper.native("status");
    assert!(!output.contains("no staged components"), "{output}");
    assert!(output.contains("staged components"), "{output}");
}

/// basic flow with dependencies › after adding components › after tagging the components › bit status › should show staged components sorted alphabetically
#[test]
fn after_tagging_components_status_sorted() {
    let helper = setup_populated_workspace();
    helper.run("tag");
    let output = helper.native("status");
    assert_sorted_alphabetically(&output);
}

/// basic flow with dependencies › after adding components › after tagging the components › bit list should show the components sorted alphabetically
#[test]
fn after_tagging_components_list_sorted() {
    let helper = setup_populated_workspace();
    helper.run("tag");
    let output = helper.native("list --local-scope");
    assert_sorted_alphabetically(&output);
}

/// basic flow with dependencies › after adding components › after tagging the components › after deleting the components › bit status › should show all of them under deleted components
#[test]
fn after_deleting_components_status_deleted() {
    let helper = setup_populated_workspace();
    helper.run("tag");
    for name in ["comp1", "comp2", "comp3"] {
        let from = helper.scopes.local_path.join(name);
        let to = helper.scopes.local_path.join(format!("{name}-bak"));
        fs::rename(from, to).unwrap();
    }
    let output = helper.native("status");
    assert!(
        output.contains("component files were deleted") || output.contains("deleted components"),
        "{output}",
    );
}

/// basic flow with dependencies › after adding components › after tagging the components › after deleting the components › bit status › should show deleted components sorted alphabetically
#[test]
fn after_deleting_components_status_sorted() {
    let helper = setup_populated_workspace();
    helper.run("tag");
    for name in ["comp1", "comp2", "comp3"] {
        let from = helper.scopes.local_path.join(name);
        let to = helper.scopes.local_path.join(format!("{name}-bak"));
        fs::rename(from, to).unwrap();
    }
    let output = helper.native("status");
    assert_sorted_alphabetically(&output);
}
