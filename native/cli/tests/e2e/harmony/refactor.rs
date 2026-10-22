//! Port of `e2e/harmony/refactor.e2e.ts`.

use crate::helper::{Helper, remote};
use std::fs;

fn read_comp1(helper: &Helper) -> String {
    fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap()
}

#[test]
fn refactoring_with_refactor_command() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");

    helper.native("rename comp2 new-comp2");

    let invalid = helper.native_run("refactor dependency-name comp2 new-comp2");
    assert!(!invalid.status.success());
    let combined = format!("{}{}", invalid.stdout, invalid.stderr);
    assert!(
        combined.contains(
            r#"refactoring: the id "comp2" is neither a valid scoped-package-name nor an existing component-id"#,
        ),
        "{combined}",
    );

    let refactor = helper.native(&format!(
        "refactor dependency-name @{}/comp2 new-comp2",
        helper.scopes.remote,
    ));
    assert!(refactor.contains(&format!("{}/comp1", helper.scopes.remote)));

    let file = read_comp1(&helper);
    assert!(file.contains("new-comp2"), "{file}");
}

#[test]
fn rename_a_new_component_with_refactor_flag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");

    helper.native("rename comp2 new-comp2 --refactor");

    let file = read_comp1(&helper);
    assert!(file.contains("new-comp2"), "{file}");
}

#[test]
fn rename_an_exported_component_with_refactor_flag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    remote::publish(&helper);

    helper.native("rename comp2 new-comp2 --refactor");

    let file = read_comp1(&helper);
    assert!(file.contains("new-comp2"), "{file}");
}

#[test]
fn fork_command_with_refactor_flag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    remote::publish(&helper);

    helper.native("fork comp2 forked-comp2 --refactor");

    let file = read_comp1(&helper);
    assert!(file.contains("forked-comp2"), "{file}");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/comp2 -x", helper.scopes.remote));

    let fork_remote = helper.native_run(&format!("fork {}/comp1 --refactor", helper.scopes.remote));
    assert!(!fork_remote.status.success());
    let combined = format!("{}{}", fork_remote.stdout, fork_remote.stderr);
    assert!(combined.contains("you can't use the --refactor flag"), "{combined}");
}
