//! Port of `e2e/harmony/lanes/lane-eject.e2e.ts` for `bit eject` on a lane ([`DEV_LANE`], [`lane_eject_when_no_main_version`]).
//!
//! Covers ejecting lane components with `main` versions and rejecting components without `main` versions.

use crate::helper::{Helper, config};
use serde_json::json;

/// Active lane name used in the `bit lane eject` end-to-end tests.
const DEV_LANE: &str = "dev";

/// Verifies `bit eject` on a lane for components with and without a `main` version ([`DEV_LANE`]).
#[test]
fn lane_eject_when_no_main_version() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope_without_owner = helper.scopes.remote.clone();
    let dot_remote = format!("ci.{scope_without_owner}");

    config::update_scope_json(&helper.scopes.remote_path.join("scope.json"), |scope| {
        scope.insert("name".into(), json!(dot_remote));
    });
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope.insert(
            "remotes".into(),
            json!({ &dot_remote: format!("file://{}", helper.scopes.remote_path.display()) }),
        );
    });
    helper.add_default_scope(&dot_remote);

    helper.populate_components(3, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.create_lane(DEV_LANE, "");
    helper.native("snap --skip-tests --unmodified");
    helper.native("export");
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope.insert("remotes".into(), json!({}));
    });

    let eject_out = helper.native("lane eject comp1");
    assert!(eject_out.contains("successfully ejected"), "{eject_out}");

    let ws_json = helper.read_workspace_jsonc();
    let pkg_name = format!("@ci/{scope_without_owner}.comp1");
    assert!(
        ws_json["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"][&pkg_name]
            .is_string(),
        "{ws_json}",
    );
    let status = helper.status_json();
    assert_eq!(
        status["locallySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert!(
        helper.scopes.local_path
            .join(format!("node_modules/{pkg_name}/index.js"))
            .exists(),
    );
    assert!(!helper.scopes.local_path.join("comp1").exists());
    helper.expect_status_to_not_have_issues();

    let list_scope = helper.list_local_scope_parsed("");
    let ids: Vec<&str> = list_scope
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|item| item["id"].as_str())
        .collect();
    assert!(ids.contains(&format!("{dot_remote}/comp1").as_str()), "{ids:?}");

    // Also test eject when there is no main version
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.populate_components(1, true, "");
    helper2.create_lane("dev", "");
    helper2.native("snap --skip-tests");
    helper2.native("export");

    let err = helper2.run_with_try_catch("bit lane eject comp1");
    assert!(err.contains("it has no main version"), "{err}");
}
