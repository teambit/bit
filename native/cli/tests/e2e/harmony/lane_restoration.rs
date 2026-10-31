//! Historical lane checkout and revert retain released bytes, versions and publication prefixes.
mod callbacks;
mod errors;
mod fixture;
mod inflate_origin;
mod phase_failure;
mod refresh;
mod versions;

use crate::{commands::move_paths::support, helper::config};

#[test]
fn checkout_restores_deleted_components_at_the_historical_versions() {
    let fixture = fixture::deleted(false);
    fixture::successful(&fixture, "checkout", false, false);
    fixture::assert_three(&fixture.helper);
    for name in ["comp1", "comp2", "comp3"] {
        assert_eq!(fixture::version(&fixture.helper, name), fixture.original[name]);
    }
}

#[test]
fn revert_without_restoration_leaves_deleted_components_deleted() {
    let fixture = fixture::deleted(false);
    fixture::successful(&fixture, "revert", false, false);
    let components = support::json(&fixture.helper, "list --json");
    assert_eq!(components.as_array().unwrap().len(), 1);
    assert!(!fixture.helper.scopes.local_path.join("comp1/index.js").exists());
    assert!(!fixture.helper.scopes.local_path.join("comp2/index.js").exists());
}

#[test]
fn revert_restores_deleted_components_without_changing_the_active_lane() {
    let fixture = fixture::deleted(false);
    let scope = bit_object_import::scope_path(&fixture.helper.scopes.local_path);
    let before = config::read_jsonc(&scope.join("scope.json"));
    fixture::successful(&fixture, "revert", true, false);
    fixture::assert_three(&fixture.helper);
    let after = config::read_jsonc(&scope.join("scope.json"));
    assert_eq!(after["lanes"]["current"], before["lanes"]["current"]);
}

#[test]
fn real_revert_json_serializes_restored_components_and_history_id() {
    let fixture = fixture::deleted(true);
    let output = fixture::successful(&fixture, "revert", true, true);
    let value: serde_json::Value = serde_json::from_str(&output.stdout).unwrap();
    assert_eq!(value["historyId"], fixture.history);
    assert_eq!(value["mergeSnapResults"], serde_json::Value::Null);
    assert!(value["components"].is_array());
    assert!(
        !value
            .as_object()
            .unwrap()
            .contains_key("installationError"),
    );
    fixture::assert_three(&fixture.helper);
}
