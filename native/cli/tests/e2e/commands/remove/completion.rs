//! Strict whole-operation batching, tracking and provider mutation parity.
use crate::{
    commands::move_paths::support::{self, bitmap, setup, successful},
    helper::{Helper, config},
};
use serde_json::json;
use std::fs;

#[test]
fn patterned_new_batch_removes_once_and_preserves_excluded_components() {
    let helper = support::workspace(3, false);
    successful(&helper, "remove **/comp*,!**/comp3 --silent");
    let map = bitmap(&helper);
    assert!(map.get("comp1").is_none());
    assert!(map.get("comp2").is_none());
    assert!(map.get("comp3").is_some());
}
#[test]
fn track_keeps_tracking_and_packages_with_and_without_source_files() {
    for keep in ["", "--keep-files"] {
        let helper = support::workspace(1, true);
        let before = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
        successful(&helper, &format!("remove comp1 --silent --track {keep}"));
        assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), before);
        assert_eq!(helper.scopes.local_path.join("comp1/index.js").exists(), !keep.is_empty());
    }
}
#[test]
fn modified_members_are_reported_while_clean_batch_members_are_removed() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.js", "module.exports='modified';\n");
    successful(&helper, "remove **/comp* --silent");
    let map = bitmap(&helper);
    assert!(map.get("comp1").is_some());
    assert!(map.get("comp2").is_none());
}
#[test]
fn versioned_batch_with_missing_main_can_still_be_removed() {
    let helper = support::workspace(2, true);
    fs::remove_file(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    successful(&helper, "remove **/comp* --silent");
    assert!(bitmap(&helper).get("comp1").is_none());
    assert!(bitmap(&helper).get("comp2").is_none());
}
#[test]
fn removing_root_component_preserves_workspace_and_nested_sources() {
    let helper = support::workspace(1, false);
    setup(&helper, "add . -i workspace-root --root");
    successful(&helper, "remove workspace-root --silent");
    assert!(helper.scopes.local_path.join("workspace.jsonc").is_file());
    assert!(helper.scopes.local_path.join("comp1/index.js").is_file());
}
#[test]
fn remove_rereads_provider_writes_before_its_batch_publication() {
    let helper = configured(false);
    let result = successful(&helper, "remove comp1 --silent");
    assert_eq!(result.stdout.matches("identity provider mutation").count(), 1);
    assert!(bitmap(&helper).get("comp1").is_none());
    assert!(!helper.scopes.local_path.join("comp1").exists());
}
pub(super) fn configured(tagged: bool) -> Helper {
    let helper = support::workspace(1, false);
    let source = include_str!("../move_paths/provider.cjs").replace("workspace.registerOnComponentLoad(async (component) => {", r"workspace.registerOnComponentLoad(async (component) => { if (component.id.fullName === 'comp1' && fs.existsSync(path.join(workspace.path, 'identity-provider-active'))) fs.appendFileSync(path.join(workspace.path, 'remove-load-count'), 'load\n');");
    helper.output_file("identity-env/index.js", &source);
    setup(&helper, "add identity-env -i env/identity");
    config::set_component_env(&helper.scopes.local_path, "env/identity", "teambit.envs/env");
    setup(&helper, "link");
    helper.output_file("identity-env/dist/index.js", &source);
    setup(&helper, "tag env/identity --ignore-issues * --message provider");
    if tagged {
        setup(&helper, "tag comp1 --ignore-issues * --message component");
    }
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/identity", helper.scopes.remote),
        json!({}),
    );
    helper.output_file("identity-provider-active", "active");
    helper
}

#[test]
fn removing_a_main_component_on_a_lane_preserves_unrelated_lane_records() {
    let helper = support::workspace(1, true);
    setup(&helper, "lane create dev");
    successful(&helper, "remove comp1 --silent --force --keep-files");
    assert!(bitmap(&helper).get("comp1").is_none());
    assert!(helper.scopes.local_path.join("comp1/index.js").is_file());
}
#[test]
fn configured_package_name_is_removed_instead_of_an_unrelated_default_package() {
    let helper = support::workspace(1, false);
    let path = helper.scopes.local_path.join(".bitmap");
    let mut map = bitmap(&helper);
    map["comp1"]["config"] = json!({"teambit.pkg/pkg":{"packageJson":{"name":"@custom/renamed"}}});
    fs::write(path, serde_json::to_vec_pretty(&map).unwrap()).unwrap();
    setup(&helper, "link");
    helper.output_file(&format!("node_modules/@{}/comp1/unrelated", helper.scopes.remote), "keep");
    successful(&helper, "remove comp1 --silent --keep-files");
    assert!(
        helper.scopes.local_path
            .join(format!("node_modules/@{}/comp1/unrelated", helper.scopes.remote))
            .is_file(),
    );
    assert!(!helper.scopes.local_path.join("node_modules/@custom/renamed").exists());
}

#[test]
fn modified_component_status_uses_one_provider_and_the_legacy_load_callback_boundary() {
    let helper = configured(true);
    let result = successful(&helper, "remove comp1 --silent");
    assert_eq!(result.stdout.matches("identity provider mutation").count(), 1);
    assert!(bitmap(&helper).get("comp1").is_some());
    assert!(helper.scopes.local_path.join("remove-load-count").is_file());
}
#[test]
fn scope_removal_cleans_only_selected_pending_merge_records() {
    let helper = support::workspace(2, true);
    let index: serde_json::Value = serde_json::from_slice(
        &fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(),
    )
    .unwrap();
    let hash = index["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"]["name"] == "comp1")
        .unwrap()["hash"]
        .as_str()
        .unwrap();
    let wire: String =
        serde_json::from_str(&setup(&helper, &format!("cat-object {hash} -s"))).unwrap();
    let models: serde_json::Value = serde_json::from_str(&wire).unwrap();
    let row = json!({"id":{"scope":helper.scopes.remote,"name":"comp1"},"head":models["head"],"laneId":{"scope":helper.scopes.remote,"name":"dev"},"unmergedPaths":[]});
    helper.output_file(".bit/unmerged.json", &serde_json::to_string_pretty(&json!([row])).unwrap());
    successful(&helper, "remove comp1 --silent --force --keep-files");
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join(".bit/unmerged.json")).unwrap(),
        "[]",
    );
    assert!(bitmap(&helper).get("comp2").is_some());
}

#[test]
fn forced_removal_uses_component_json_and_preserves_it_with_keep_files() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/component.json",
        &json!({
            "componentId":{"scope":helper.scopes.remote,"name":"comp1"},"propagate":true,
            "extensions":{"teambit.pkg/pkg":{"packageJson":{"name":"@custom/from-config"}}}
        })
        .to_string(),
    );
    setup(&helper, "link");
    let before = fs::read(helper.scopes.local_path.join("comp1/component.json")).unwrap();
    assert!(helper.scopes.local_path.join("node_modules/@custom/from-config").exists());
    successful(&helper, "remove comp1 --silent --force --keep-files");
    assert_eq!(fs::read(helper.scopes.local_path.join("comp1/component.json")).unwrap(), before);
    assert!(!helper.scopes.local_path.join("node_modules/@custom/from-config").exists());
}
