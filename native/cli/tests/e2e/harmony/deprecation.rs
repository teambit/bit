//! Local deprecation, persisted ranges and the published downstream readers.
mod lifecycle;
mod ranges;
use crate::commands::move_paths::support::{self, aspect, bitmap, compare, json, successful};
const DEPRECATION: &str = "teambit.component/deprecation";

#[test]
fn tagged_deprecation_marks_the_component_modified_and_survives_tagging() {
    let helper = support::workspace(3, true);
    successful(&helper, "deprecate comp2");
    assert_eq!(aspect(&helper, "comp2", DEPRECATION).unwrap()["deprecate"], true);
    let modified = json(&helper, "status --json")["modifiedComponents"].clone();
    assert_eq!(modified.as_array().unwrap().len(), 1);
    assert!(
        modified[0]
            .as_str()
            .unwrap()
            .contains("comp2"),
    );
    support::tag(&helper);
    assert!(
        json(&helper, "status --json")["modifiedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert_eq!(aspect(&helper, "comp2", DEPRECATION).unwrap()["deprecate"], true);
    assert!(bitmap(&helper)["comp2"].get("config").is_none());
    assert_eq!(listed(&helper, "comp2")["deprecated"], true);
}
#[test]
fn wildcard_deprecation_and_undeprecation_change_every_matched_component() {
    let helper = support::workspace(3, true);
    let result = successful(&helper, r#"deprecate "**""#);
    assert!(result.stdout.contains("3 component"));
    for id in ["comp1", "comp2", "comp3"] {
        assert_eq!(aspect(&helper, id, DEPRECATION).unwrap()["deprecate"], true);
    }
    let result = successful(&helper, r#"undeprecate "**""#);
    assert!(result.stdout.contains("3 component"));
    for id in ["comp1", "comp2", "comp3"] {
        assert_eq!(aspect(&helper, id, DEPRECATION).unwrap()["deprecate"], false);
    }
}
#[test]
fn wildcard_replacement_and_invalid_range_errors_do_not_publish_invalid_config() {
    for command in [r#"deprecate "**" --new-id comp1"#, "deprecate comp1 --range not-a-range"] {
        let helper = support::workspace(3, true);
        let result = compare(&helper, command);
        assert!(!result.status.success());
        assert!(aspect(&helper, "comp1", DEPRECATION).is_none());
    }
}
#[test]
fn undeprecating_unmodified_components_is_a_noop_and_checkout_reset_clears_staged_deprecation() {
    let helper = support::workspace(3, true);
    let result = successful(&helper, r#"undeprecate "**""#);
    assert!(result.stdout.contains("no changes have been made"));
    assert!(
        json(&helper, "status --json")["modifiedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    successful(&helper, "deprecate comp1");
    support::setup(&helper, "checkout reset comp1 -x");
    assert!(aspect(&helper, "comp1", DEPRECATION).is_none());
}
#[test]
fn replacement_id_is_saved_as_component_identity_metadata() {
    let helper = support::workspace(2, true);
    successful(&helper, "deprecate comp1 --new-id comp2");
    assert_eq!(aspect(&helper, "comp1", DEPRECATION).unwrap()["newId"]["name"], "comp2");
}
fn listed(helper: &crate::helper::Helper, name: &str) -> serde_json::Value {
    let list = json(helper, "list --json");
    list.as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == format!("{}/{name}", helper.scopes.remote))
        .unwrap()
        .clone()
}
