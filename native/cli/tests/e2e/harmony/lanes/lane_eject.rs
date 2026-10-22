//! `e2e/harmony/lanes/lane-eject.e2e.ts`.

use crate::helper::{Helper, config};
use serde_json::json;

/// - `bit lane command › eject components with dependencies after export › eject with the default options › should indicate that the eject was successful`
/// - `bit lane command › eject components with dependencies after export › eject with the default options › should save the component in workspace.jsonc`
/// - `bit lane command › eject components with dependencies after export › eject with the default options › should mark the component as deleted on the lane`
/// - `bit lane command › eject components with dependencies after export › eject with the default options › should have the component files as a package (in node_modules)`
/// - `bit lane command › eject components with dependencies after export › eject with the default options › should delete the original component files from the file-system`
/// - `bit lane command › eject components with dependencies after export › eject with the default options › bit status should show no issues`
/// - `bit lane command › eject components with dependencies after export › eject with the default options › should not delete the objects from the scope`
/// - `bit lane command › eject when there is no main version › should throw an error saying it has no main version`
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
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
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
    helper2.snap_all_components_without_build("");
    helper2.export("");

    let err = helper2.run_with_try_catch("bit lane eject comp1");
    assert!(err.contains("it has no main version"), "{err}");
}
