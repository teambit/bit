//! `e2e/harmony/delete.e2e.ts`.

use crate::helper::{Helper, remote};

/// bit delete command › import a scope with deleted components
#[test]
fn import_a_scope_with_deleted_components() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);
    helper.native("delete comp1 --silent");
    helper.run("tag --message second");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/* -x", helper.scopes.remote));
    let list = helper.run("list");
    assert!(!list.contains("comp1"));
    assert!(list.contains("comp2"));
    assert!(list.contains("comp3"));

    helper.run(&format!("import {}/comp1 -x", helper.scopes.remote));
    let list_after = helper.run("list");
    assert!(list_after.contains("comp1"));
}

/// bit delete command › bit checkout reset after local delete
#[test]
fn checkout_reset_after_local_delete() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.run("tag --message first");
    helper.native("delete comp1 --silent");
    let status_before = helper.run("status");
    assert!(status_before.contains("deleted") || status_before.contains("comp1"));
    helper.run("checkout reset comp1");
    let status_after = helper.run("status");
    assert!(!status_after.contains("deleted components"));
}

/// bit delete command › deleting component then creating a new one with the same name
#[test]
fn deleting_component_then_creating_a_new_one_with_same_name() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);
    helper.native("delete comp1 --silent");
    helper.run("tag --message second");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.populate_components(1, true, "");
    helper.run("tag --message recreated");
    let output = helper.cmd("export");
    assert!(
        output.stdout.contains("were marked as deleted on the remote scope")
            || output.stderr.contains("were marked as deleted on the remote scope"),
        "{output:?}",
    );
}

/// bit delete command › delete and then remove
#[test]
fn delete_and_then_remove() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);
    helper.native("delete comp1 --silent");
    helper.run("tag --message second");
    helper.run(&format!("import {}/comp1 -x", helper.scopes.remote));
    helper.run("remove comp1 --silent");
    let status = helper.run("status");
    assert!(!status.contains("error"));
}
