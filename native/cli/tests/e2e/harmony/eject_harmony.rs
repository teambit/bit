//! `e2e/harmony/eject-harmony.e2e.ts`.

use crate::helper::{Helper, config};
use serde_json::json;

/// - `eject command on Harmony › eject components with dependencies after export › eject with the default options › should indicate that the eject was successful`
/// - `eject command on Harmony › eject components with dependencies after export › eject with the default options › should save the component in workspace.jsonc`
/// - `eject command on Harmony › eject components with dependencies after export › eject with the default options › should have the component files as a package (in node_modules)`
/// - `eject command on Harmony › eject components with dependencies after export › eject with the default options › should delete the original component files from the file-system`
/// - `eject command on Harmony › eject components with dependencies after export › eject with the default options › should delete the component from bit.map`
/// - `eject command on Harmony › eject components with dependencies after export › eject with the default options › bit status should show a clean state`
/// - `eject command on Harmony › eject components with dependencies after export › eject with the default options › should not delete the objects from the scope`
/// - `eject command on Harmony › eject components with dependencies after export › eject with --keep-files flag › should keep the original component files from the file-system intact`
#[test]
fn eject_components_with_dependencies_after_export() {
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

    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope.insert("remotes".into(), json!({}));
    });
    let scope_before_eject = helper.clone_workspace();

    let eject_out = helper.native("eject comp1");
    assert!(eject_out.contains("successfully ejected the following components"), "{eject_out}");

    let ws_json = helper.read_workspace_jsonc();
    let pkg_name = format!("@ci/{scope_without_owner}.comp1");
    assert!(
        ws_json["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"][&pkg_name]
            .is_string(),
        "{ws_json}",
    );
    assert!(
        helper.scopes.local_path
            .join(format!("node_modules/{pkg_name}/index.js"))
            .exists(),
    );
    assert!(!helper.scopes.local_path.join("comp1").exists());
    let bitmap = helper.read_bit_map();
    assert!(bitmap["comp1"].is_null(), "{bitmap}");
    helper.expect_status_to_be_clean();

    let list_scope = helper.list_local_scope_parsed("");
    let ids: Vec<&str> = list_scope
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|item| item["id"].as_str())
        .collect();
    assert!(ids.contains(&format!("{dot_remote}/comp1").as_str()), "{ids:?}");

    helper.get_cloned_workspace(&scope_before_eject);
    helper.native("eject comp1 --keep-files");
    assert!(helper.scopes.local_path.join("comp1").is_dir());
}
