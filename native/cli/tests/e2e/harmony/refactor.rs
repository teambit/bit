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

    let rename = helper.cmd("rename comp2 new-comp2");
    assert!(rename.native, "{}", rename.trace);
    assert!(rename.status.success(), "{}\n{}", rename.stdout, rename.stderr);

    let invalid = helper.cmd("refactor dependency-name comp2 new-comp2");
    assert!(invalid.native, "{}", invalid.trace);
    assert!(!invalid.status.success());
    let combined = format!("{}{}", invalid.stdout, invalid.stderr);
    assert!(
        combined.contains(
            r#"refactoring: the id "comp2" is neither a valid scoped-package-name nor an existing component-id"#,
        ),
        "{combined}",
    );

    let refactor =
        helper.cmd(&format!("refactor dependency-name @{}/comp2 new-comp2", helper.scopes.remote));
    assert!(refactor.native, "{}", refactor.trace);
    assert!(refactor.status.success(), "{}\n{}", refactor.stdout, refactor.stderr);
    assert!(refactor.stdout.contains(&format!("{}/comp1", helper.scopes.remote)));

    let file = read_comp1(&helper);
    assert!(file.contains("new-comp2"), "{file}");
}

#[test]
fn rename_a_new_component_with_refactor_flag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");

    let rename = helper.cmd("rename comp2 new-comp2 --refactor");
    assert!(rename.native, "{}", rename.trace);
    assert!(rename.status.success(), "{}\n{}", rename.stdout, rename.stderr);

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

    let rename = helper.cmd("rename comp2 new-comp2 --refactor");
    assert!(rename.native, "{}", rename.trace);
    assert!(rename.status.success(), "{}\n{}", rename.stdout, rename.stderr);

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

    let fork_local = helper.cmd("fork comp2 forked-comp2 --refactor");
    assert!(fork_local.native, "{}", fork_local.trace);
    assert!(fork_local.status.success(), "{}\n{}", fork_local.stdout, fork_local.stderr);

    let file = read_comp1(&helper);
    assert!(file.contains("forked-comp2"), "{file}");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));

    let fork_remote = helper.cmd(&format!("fork {}/comp1 --refactor", helper.scopes.remote));
    assert!(fork_remote.native, "{}", fork_remote.trace);
    assert!(!fork_remote.status.success());
    let combined = format!("{}{}", fork_remote.stdout, fork_remote.stderr);
    assert!(combined.contains("you can't use the --refactor flag"), "{combined}");
}
