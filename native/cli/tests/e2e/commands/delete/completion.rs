//! Whole-state soft-deletion batches preserve unrelated component configuration.
use crate::commands::move_paths::support::{self, bitmap, setup, successful};
use serde_json::json;
use std::fs;

#[test]
fn patterned_delete_marks_all_selected_versions_in_one_bitmap_publication() {
    let helper = support::workspace(3, true);
    successful(&helper, "delete **/comp*,!**/comp3 --silent");
    let map = bitmap(&helper);
    assert_eq!(map["comp1"]["config"]["teambit.component/remove"]["removed"], true);
    assert_eq!(map["comp2"]["config"]["teambit.component/remove"]["removed"], true);
    assert!(helper.scopes.local_path.join("comp3/index.js").is_file());
}
#[test]
fn deletion_preserves_unrelated_configured_aspects() {
    let helper = support::workspace(1, true);
    let path = helper.scopes.local_path.join(".bitmap");
    let mut map = bitmap(&helper);
    map["comp1"]["config"] = json!({"teambit.pkg/pkg":{"packageJson":{"description":"preserved"}}});
    fs::write(path, serde_json::to_vec_pretty(&map).unwrap()).unwrap();
    successful(&helper, "delete comp1 --silent");
    assert_eq!(
        bitmap(&helper)["comp1"]["config"]["teambit.pkg/pkg"]["packageJson"]["description"],
        "preserved",
    );
}
#[test]
fn historic_snap_selection_only_marks_config_and_keeps_current_sources() {
    let helper = support::workspace(1, true);
    successful(&helper, "delete comp1 --silent --snaps aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert!(helper.scopes.local_path.join("comp1/index.js").is_file());
    assert_eq!(bitmap(&helper)["comp1"]["config"]["teambit.component/remove"]["removed"], false);
}
#[test]
fn update_main_on_a_lane_preserves_other_configuration_and_sources_policy() {
    let helper = support::workspace(1, true);
    setup(&helper, "export");
    setup(&helper, "lane create dev");
    helper.output_file("comp1/index.js", "module.exports='lane';\n");
    setup(&helper, "snap --ignore-issues * --message lane");
    successful(&helper, "delete comp1 --silent --update-main");
    assert_eq!(
        bitmap(&helper)["comp1"]["config"]["teambit.component/remove"],
        json!({"removed":true,"removeOnMain":true}),
    );
}
#[test]
fn update_main_range_keeps_lane_sources_and_marks_only_the_selected_range() {
    let helper = support::workspace(1, true);
    crate::helper::remote::publish(&helper);
    setup(&helper, "lane create dev");
    successful(&helper, "delete comp1 --silent --update-main --range <1.0.0");
    assert!(helper.scopes.local_path.join("comp1/index.js").is_file());
    assert_eq!(
        bitmap(&helper)["comp1"]["config"]["teambit.component/remove"]["removeOnMain"],
        true,
    );
}

#[test]
fn missing_main_deletion_fails_before_package_bitmap_or_source_changes() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/remaining.js", "module.exports=2;\n");
    fs::remove_file(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let before = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let result = support::compare(&helper, "delete comp1 --silent");
    assert!(!result.status.success());
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), before);
    assert!(helper.scopes.local_path.join("comp1/remaining.js").is_file());
}
#[test]
fn compound_semver_range_is_stored_without_removing_current_sources() {
    let helper = support::workspace(1, true);
    successful(&helper, r#"delete comp1 --silent --range ">=0.0.1 <2.0.0""#);
    assert_eq!(
        bitmap(&helper)["comp1"]["config"]["teambit.component/remove"]["range"],
        ">=0.0.1 <2.0.0",
    );
    assert!(helper.scopes.local_path.join("comp1/index.js").is_file());
}

#[test]
fn deleting_a_nested_component_removes_only_its_empty_immediate_parent() {
    let helper = support::workspace(1, true);
    setup(&helper, "move comp1 nested/group/comp1");
    successful(&helper, "delete comp1 --silent");
    assert!(!helper.scopes.local_path.join("nested/group").exists());
    assert!(helper.scopes.local_path.join("nested").is_dir());
}

#[test]
fn missing_component_directory_has_its_own_error_and_no_publication() {
    let helper = support::workspace(1, true);
    fs::remove_dir_all(helper.scopes.local_path.join("comp1")).unwrap();
    let before = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let result = support::compare(&helper, "delete comp1 --silent");
    assert!(!result.status.success());
    assert!(result.stderr.contains(r#"component in path "comp1" was not found"#));
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), before);
}

#[test]
fn deletion_uses_package_metadata_from_component_json() {
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
    assert!(helper.scopes.local_path.join("node_modules/@custom/from-config").exists());
    successful(&helper, "delete comp1 --silent");
    assert!(!helper.scopes.local_path.join("node_modules/@custom/from-config").exists());
}
