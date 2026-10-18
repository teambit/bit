//! Scope-wide operations compare complete same-path state and retained mutation prefixes.
mod callbacks;
mod fixture;
mod installation;
mod refactor;
use crate::{
    commands::move_paths::support::{self, bitmap, compare, setup, successful},
    helper::{config, remote},
};
use serde_json::json;
#[test]
fn scope_rename_changes_the_workspace_default_and_all_matching_new_components() {
    let helper = support::workspace(2, false);
    let old = helper.scopes.remote.clone();
    successful(&helper, &format!("scope rename {old} new.scope --preserve -x"));
    let map = bitmap(&helper);
    assert_eq!(map["comp1"]["defaultScope"], "new.scope");
    assert_eq!(map["comp2"]["defaultScope"], "new.scope");
    assert_eq!(map["comp1"]["rootDir"], "comp1");
    let workspace = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert_eq!(workspace["teambit.workspace/workspace"]["defaultScope"], "new.scope");
    let ids = support::json(&helper, "list --json");
    let mut ids = ids
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    ids.sort_unstable();
    assert_eq!(ids, vec!["new.scope/comp1", "new.scope/comp2"]);
    assert!(
        !helper.scopes.local_path
            .join(format!("node_modules/@{old}/comp1"))
            .exists(),
    );
    let package = helper.scopes.local_path.join("node_modules/@new/scope.comp1");
    assert!(package.is_dir());
    assert!(package.join("dist").is_dir());
}
#[test]
fn owner_rename_keeps_component_directories_across_multiple_scopes() {
    let helper = support::workspace(2, false);
    setup(&helper, "scope set old.one comp1");
    setup(&helper, "scope set old.two comp2");
    config::set_workspace_aspect_key(&helper.scopes.local_path, "defaultScope", json!("old.one"));
    successful(&helper, "scope rename-owner old replacement --ast");
    let map = bitmap(&helper);
    assert_eq!(map["comp1"]["defaultScope"], "replacement.one");
    assert_eq!(map["comp2"]["defaultScope"], "replacement.two");
    assert_eq!(map["comp1"]["rootDir"], "comp1");
    assert_eq!(map["comp2"]["rootDir"], "comp2");
    let workspace = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert_eq!(workspace["teambit.workspace/workspace"]["defaultScope"], "replacement.one");
    for (scope, name) in [("one", "comp1"), ("two", "comp2")] {
        assert!(
            !helper.scopes.local_path
                .join(format!("node_modules/@old/{scope}.{name}"))
                .exists(),
        );
        let package =
            helper.scopes.local_path.join(format!("node_modules/@replacement/{scope}.{name}"));
        assert!(package.is_dir());
        assert!(package.join("dist").is_dir());
    }
    let ids = support::json(&helper, "list --json");
    let mut ids = ids
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    ids.sort_unstable();
    assert_eq!(ids, vec!["replacement.one/comp1", "replacement.two/comp2"]);
}
#[test]
fn default_only_scope_rename_does_not_require_a_matching_component() {
    let helper = support::workspace(0, false);
    let old = helper.scopes.remote.clone();
    successful(&helper, &format!("scope rename {old} replacement.scope -x"));
    assert!(bitmap(&helper).get("comp1").is_none());
}
#[test]
fn staged_component_failure_retains_the_earlier_default_scope_write() {
    let helper = support::workspace(1, true);
    let old = helper.scopes.remote.clone();
    let result = compare(&helper, &format!("scope rename {old} replacement.scope -x"));
    assert!(!result.status.success());
    let workspace = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert_eq!(workspace["teambit.workspace/workspace"]["defaultScope"], "replacement.scope");
    assert_eq!(bitmap(&helper)["comp1"]["defaultScope"], old);
}
#[test]
fn exported_scope_rename_creates_replacements_and_deprecates_the_original_batch() {
    let helper = support::workspace(2, true);
    remote::publish(&helper);
    fixture::delay(&helper, &["comp1", "comp2"]);
    let old = helper.scopes.remote.clone();
    successful(&helper, &format!("scope rename {old} replacement.scope --deprecate --preserve -x"));
    let map = bitmap(&helper);
    assert!(
        map.as_object()
            .unwrap()
            .values()
            .any(|row| row["defaultScope"] == "replacement.scope"),
    );
    assert!(
        map.as_object()
            .unwrap()
            .values()
            .any(|row| row["config"]["teambit.component/deprecation"]["deprecate"] == true),
    );
}
