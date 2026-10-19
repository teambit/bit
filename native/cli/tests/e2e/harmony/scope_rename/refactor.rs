use crate::{
    commands::move_paths::support::{self, bitmap, setup, successful},
    helper::{config, remote},
};
use serde_json::json;
use std::fs;
#[test]
fn mixed_exported_and_new_scope_refactoring_rewrites_the_chain_and_aspect_key() {
    let helper = support::workspace(3, false);
    let old = helper.scopes.remote.clone();
    helper.output_file("comp1/index.js", &format!("module.exports=require('@{old}/comp2');\n"));
    helper.output_file("comp2/index.js", &format!("module.exports=require('@{old}/comp3');\n"));
    setup(&helper, "tag comp3 --skip-auto-tag --ignore-issues * --message exported");
    remote::publish(&helper);
    super::fixture::delay(&helper, &["comp1", "comp2", "comp3"]);
    compile_mixed_baseline(&helper);
    let deprecate = format!("deprecate {old}/comp3@0.0.1");
    let output = crate::commands::add::support::history_oracle::compare(
        &helper,
        &format!("scope rename {old} replacement.scope --refactor --deprecate -x"),
        str::to_owned,
        ["adding replacement.scope/comp3", deprecate.as_str(), "rename", "rename"],
        false,
    );
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    let map = bitmap(&helper);
    for name in ["comp1", "comp2"] {
        let row = map
            .as_object()
            .unwrap()
            .values()
            .find(|row| row["name"] == name && row["defaultScope"] == "replacement.scope")
            .unwrap();
        let source = fs::read_to_string(
            helper.scopes.local_path
                .join(row["rootDir"].as_str().unwrap())
                .join("index.js"),
        )
        .unwrap();
        assert!(source.contains("@replacement/scope.comp"));
        assert!(!source.contains(&format!("@{old}/")));
    }
    assert_mixed_results(&helper, &map, &old);
}

fn compile_mixed_baseline(helper: &crate::helper::Helper) {
    // Scope rename compiles replacement IDs, not the deprecated original. Its
    // baseline must therefore contain genuine compiler output for the old ID.
    setup(helper, "compile");
    let status = support::json(helper, "status --json");
    assert!(
        status["componentsWithIssues"]
            .as_array()
            .unwrap()
            .is_empty(),
        "released compile must establish a valid mixed baseline: {status}",
    );
}

fn assert_mixed_results(helper: &crate::helper::Helper, map: &serde_json::Value, old: &str) {
    let source = map
        .as_object()
        .unwrap()
        .values()
        .find(|row| row["name"] == "comp3" && row["scope"] == old)
        .unwrap();
    let deprecation = &source["config"]["teambit.component/deprecation"];
    assert_eq!(deprecation["deprecate"], true);
    assert_eq!(deprecation["newId"]["name"], "comp3");
    assert_eq!(deprecation["newId"]["scope"], "replacement.scope");
    let listed = support::json(helper, "list --json");
    let mut ids = listed
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["id"].as_str().unwrap().to_owned())
        .filter(|id| !id.ends_with("/env/scope-delay"))
        .collect::<Vec<_>>();
    ids.sort();
    let mut expected = vec![
        format!("{old}/comp3"),
        "replacement.scope/comp1".into(),
        "replacement.scope/comp2".into(),
        "replacement.scope/comp3".into(),
    ];
    expected.sort();
    assert_eq!(ids, expected);
    assert_mixed_status(helper, old);
}

fn assert_mixed_status(helper: &crate::helper::Helper, old: &str) {
    let status = support::json(helper, "status --json");
    assert!(
        status["componentsWithIssues"]
            .as_array()
            .unwrap()
            .is_empty(),
        "released status after the strict scope pair: {status}",
    );
    let mut new = status["newComponents"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap())
        .collect::<Vec<_>>();
    new.sort_unstable();
    assert_eq!(
        new,
        ["replacement.scope/comp1", "replacement.scope/comp2", "replacement.scope/comp3"],
    );
    let modified = status["modifiedComponents"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap())
        .collect::<Vec<_>>();
    let fixture = "fixture.tools/env/scope-delay";
    let affected = modified
        .iter()
        .copied()
        .filter(|id| *id != fixture)
        .collect::<Vec<_>>();
    assert_eq!(affected, [format!("{old}/comp3")], "released status: {status}");
    assert!(
        modified
            .iter()
            .all(|id| *id == fixture || *id == format!("{old}/comp3")),
        "only the explicitly installed timing provider is unrelated to the original scenario: {status}",
    );
}

#[test]
fn scope_refactoring_updates_an_actual_configured_aspect_key() {
    let helper = support::workspace(1, false);
    let old = helper.scopes.remote.clone();
    config::set_workspace_key(&helper.scopes.local_path, &format!("{old}/comp1"), json!({}));
    super::fixture::delay(&helper, &["comp1"]);
    successful(&helper, &format!("scope rename {old} replacement.scope --refactor --preserve -x"));
    let workspace = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert!(
        workspace
            .get(format!("{old}/comp1"))
            .is_none(),
    );
    assert!(workspace.get("replacement.scope/comp1").is_some());
}
#[test]
fn exported_replacement_imports_and_original_dependents_are_both_refactored() {
    let helper = support::workspace(2, false);
    let old = helper.scopes.remote.clone();
    helper.output_file("comp1/index.js", &format!("module.exports=require('@{old}/comp2');\n"));
    support::tag(&helper);
    remote::publish(&helper);
    super::fixture::delay(&helper, &["comp1", "comp2"]);
    successful(
        &helper,
        &format!("scope rename {old} replacement.scope --refactor --deprecate --preserve -x"),
    );
    let map = bitmap(&helper);
    for row in map
        .as_object()
        .unwrap()
        .values()
        .filter(|row| row["name"] == "comp1")
    {
        let text = fs::read_to_string(
            helper.scopes.local_path
                .join(row["rootDir"].as_str().unwrap())
                .join("index.js"),
        )
        .unwrap();
        assert!(text.contains("@replacement/scope.comp2"));
    }
}

#[test]
fn default_exported_scope_rename_deletes_the_original_source_component() {
    let helper = support::workspace(1, true);
    remote::publish(&helper);
    super::fixture::delay(&helper, &["comp1"]);
    let old = helper.scopes.remote.clone();
    successful(&helper, &format!("scope rename {old} replacement.scope --preserve -x"));
    let map = bitmap(&helper);
    assert!(
        map.as_object()
            .unwrap()
            .values()
            .any(|row| row["scope"] == old
                && row["config"]["teambit.component/remove"]["removed"] == true),
    );
}

#[test]
fn exported_nondefault_scope_rename_matches_the_published_target_resolution_boundary() {
    let helper = support::workspace(1, true);
    remote::publish(&helper);
    let old = helper.scopes.remote.clone();
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        json!("unrelated.scope"),
    );
    let result = super::support::compare(
        &helper,
        &format!("scope rename {old} replacement.scope --preserve -x"),
    );
    assert!(!result.status.success());
    assert!(result.stderr.contains("replacement.scope/comp1"));
    let map = bitmap(&helper);
    assert!(
        map.as_object()
            .unwrap()
            .values()
            .any(|row| row["name"] == "comp1"
                && row["defaultScope"] == "unrelated.scope"
                && row["version"] == ""),
    );
    assert!(
        !map.as_object()
            .unwrap()
            .values()
            .any(|row| row["config"]["teambit.component/remove"]["removed"] == true),
    );
}
#[test]
fn exported_owner_rename_preserves_the_published_versioned_target_contract() {
    let mut helper = crate::helper::Helper::new();
    helper.scopes.remote = format!("old.{}", helper.scopes.remote);
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports=()=> 'comp1';\n");
    setup(&helper, "add comp1 -i comp1");
    support::tag(&helper);
    remote::publish(&helper);
    let result = super::support::compare(&helper, "scope rename-owner old replacement");
    assert!(!result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(result.stderr.contains("comp1@0.0.1"));
    let map = bitmap(&helper);
    assert!(
        map.as_object()
            .unwrap()
            .values()
            .any(|row| row["name"] == "comp1" && row["scope"] == "" && row["version"] == ""),
    );
    assert!(
        !map.as_object()
            .unwrap()
            .values()
            .any(|row| row["config"]["teambit.component/remove"]["removed"] == true),
    );
}

#[test]
fn mixed_scope_refactor_retains_released_list_order_across_later_bitmap_writes() {
    let helper = support::workspace(4, false);
    let old = helper.scopes.remote.clone();
    for index in 1..4 {
        helper.output_file(
            &format!("comp{index}/index.js"),
            &format!("module.exports=require('@{old}/comp{}');\n", index + 1),
        );
    }
    for name in ["comp4", "comp3"] {
        setup(&helper, &format!("tag {name} --skip-auto-tag --ignore-issues * --message exported"));
    }
    remote::publish(&helper);
    super::fixture::delay(&helper, &["comp1", "comp2", "comp3", "comp4"]);
    let result = compare_mixed_refactor(&helper, &old);
    let report = result.stdout
        .split("refactored components")
        .nth(1)
        .unwrap();
    let changed = report
        .lines()
        .filter_map(|line| line.strip_prefix("   › "))
        .collect::<std::collections::BTreeSet<_>>();
    let original = format!("{old}/comp3@0.0.1");
    assert_eq!(
        changed,
        std::collections::BTreeSet::from([
            original.as_str(),
            "replacement.scope/comp1",
            "replacement.scope/comp2",
            "replacement.scope/comp3",
        ]),
    );
}

fn compare_mixed_refactor(helper: &crate::helper::Helper, old: &str) -> crate::helper::Run {
    let deprecate3 = format!("deprecate {old}/comp3@0.0.1");
    let deprecate4 = format!("deprecate {old}/comp4@0.0.1");
    let result = crate::commands::add::support::history_oracle::compare(
        helper,
        &format!("scope rename {old} replacement.scope --refactor --deprecate -x"),
        str::to_owned,
        [
            "adding replacement.scope/comp3",
            deprecate3.as_str(),
            "adding replacement.scope/comp4",
            deprecate4.as_str(),
            "rename",
            "rename",
        ],
        false,
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    result
}
