//! `--fetch-deps` bypasses a saved dependency graph without adding dependencies to the bitmap.
use crate::helper::{Helper, config::read_jsonc};
use std::ffi::OsStr;

#[test]
fn fetch_deps_materializes_only_the_selected_component() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "--message dependencies");
    crate::helper::remote::seed_after_node_export(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let oracle = helper.clone_workspace();
    let command = format!("import {}/comp1 -x --fetch-deps", helper.scopes.remote);
    let expected = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(expected.status.success(), "{}{}", expected.stdout, expected.stderr);
    let actual = helper.native_run(&command);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(super::policy::stable(&actual.stdout), super::policy::stable(&expected.stdout));
    assert_eq!(actual.stderr, expected.stderr);
    let bitmap = read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap, read_jsonc(&oracle.join(".bitmap")));
    assert!(bitmap.get("comp1").is_some());
    assert!(bitmap.get("comp2").is_none());
    let command = format!("cat-component {}/comp2", helper.scopes.remote);
    let expected = Helper::cmd_in_with(
        &oracle,
        &command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let actual = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    assert!(expected.status.success(), "{}", expected.stderr);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(
        super::history::metadata(&actual.stdout),
        super::history::metadata(&expected.stdout),
    );
}
