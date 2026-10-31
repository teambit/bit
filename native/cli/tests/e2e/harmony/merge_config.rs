//! `e2e/harmony/merge-config.e2e.ts`.

use crate::helper::{Helper, parse};
use serde_json::{Value, json};

fn show_aspect_config(helper: &Helper, comp: &str, aspect_id: &str) -> Option<Value> {
    let show = parse(&helper.show_component_parsed(comp));
    show["extensions"]
        .as_array()?
        .iter()
        .find(|ext| {
            ext["name"].as_str() == Some(aspect_id)
                || ext["extensionId"].as_str() == Some(aspect_id)
        })
        .cloned()
}

/// - `merge config scenarios › diverge with different component versions › merging the lane to main › should keep the configuration from the lane`
/// - `merge config scenarios › diverge with different component versions › switching to the lane › should not show the component as modified`
/// - `merge config scenarios › diverge with different component versions › switching to the lane › should be able to install the correct versions after deleting node-modules`
/// - `merge config scenarios › diverge with different component versions › switching to the lane › merge from main to the lane › bit status should show all components as componentsDuringMergeState and not in pendingUpdatesFromMain`
/// - `merge config scenarios › diverge with config that is possible to merge › bit status should not show the component with an issue of MergeConfigHasConflict`
/// - `merge config scenarios › diverge with config that is possible to merge › should show the component deprecated due to the successful merge-config`
/// - `merge config scenarios › diverge with config that is possible to merge › should not generate merge-conflict file, instead, the merge data should be in unmerged file`
#[test]
fn diverge_with_config_possible_to_merge_and_different_versions() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    let main_before_diverge = helper.clone_workspace();

    helper.native("lane create dev");
    helper.native("deprecate comp1");
    helper.native("snap --skip-tests");
    helper.native("export");

    helper.get_cloned_workspace(&main_before_diverge);
    helper.native("snap --unmodified --skip-tests");
    helper.native("export");
    let remote = helper.scopes.remote.clone();
    helper.native(&format!(
        "lane merge {remote}/dev --no-auto-snap --skip-dependency-installation --no-squash",
    ));

    helper.expect_status_to_not_have_issue("MergeConfigHasConflict");
    let dep_cfg = show_aspect_config(&helper, "comp1", "teambit.component/deprecation").unwrap();
    assert_eq!(dep_cfg["config"]["deprecate"], json!(true));
    assert!(!helper.get_config_merge_path().exists());
}

/// - `merge config scenarios › diverge with conflicted config › bit status should show the component with an issue of MergeConfigHasConflict`
/// - `merge config scenarios › diverge with conflicted config › fixing the conflict with ours › should show the component deprecated`
/// - `merge config scenarios › diverge with conflicted config › fixing the conflict with theirs › should show the component as undeprecated`
/// - `merge config scenarios › diverge with conflicted config › fixing the conflict with theirs › should delete the config-merge file after snapping`
#[test]
fn diverge_with_conflicted_config_ours_and_theirs() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    let main_before_diverge = helper.clone_workspace();

    helper.native("lane create dev");
    helper.native("deprecate comp1");
    helper.run("snap --skip-tests");
    helper.native("export");

    helper.get_cloned_workspace(&main_before_diverge);
    helper.native("deprecate comp1");
    helper.run("snap --skip-tests");
    helper.native("undeprecate comp1");
    helper.run("snap --skip-tests");
    helper.native("export");

    let remote = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("lane import {remote}/dev -x"));
    helper.native("lane merge main --no-auto-snap --skip-dependency-installation");
    let before_resolved = helper.clone_workspace();

    helper.expect_status_to_have_issue("MergeConfigHasConflict");

    // 1. Fix with ours
    helper.fix_merge_config_conflict("ours");
    let dep_ours = show_aspect_config(&helper, "comp1", "teambit.component/deprecation").unwrap();
    assert_eq!(dep_ours["config"]["deprecate"], json!(true));

    // 2. Fix with theirs and snap
    helper.get_cloned_workspace(&before_resolved);
    helper.fix_merge_config_conflict("theirs");
    let dep_theirs = show_aspect_config(&helper, "comp1", "teambit.component/deprecation").unwrap();
    assert_eq!(dep_theirs["config"]["deprecate"], json!(false));

    helper.run("snap --skip-tests");
    assert!(!helper.get_config_merge_path().exists());
}

/// - `merge config scenarios › diverge with different dependencies config › bit status should show the component with an issue of MergeConfigHasConflict`
/// - `merge config scenarios › diverge with different dependencies config › fixing the conflict with ours › should show the dev-dependency as it was set on the lane`
/// - `merge config scenarios › diverge with different dependencies config › fixing the conflict with theirs › should show the dev-dependency as it was set on main`
/// - `merge config scenarios › diverge with different dependencies config › fixing the conflict with theirs › running bit deps set of another pkg, should work`
/// - `merge config scenarios › diverge with different dependencies config › merging with --auto-merge-resolve ours › should not generate the config-merge file`
/// - `merge config scenarios › diverge with different dependencies config › merging with --auto-merge-resolve ours › should show the dev-dependency as it was set on the lane`
/// - `merge config scenarios › diverge with different dependencies config › merging with --auto-merge-resolve theirs › should not generate the config-merge file`
/// - `merge config scenarios › diverge with different dependencies config › merging with --auto-merge-resolve theirs › should show the dev-dependency as it was set on main`
/// - `merge config scenarios › diverge with different dependencies config when "other" adds a package (current === base) › should not remove the packages it had previously via deps set`
#[test]
fn diverge_with_different_dependencies_config() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 lodash@3.3.1");
    helper.native("tag --skip-tests");
    helper.native("export");
    let main_before_diverge = helper.clone_workspace();

    helper.native("lane create dev");
    helper.native("deprecate comp1");
    helper.native("deps set comp1 ramda@0.0.20 --dev");
    helper.run("snap --skip-tests");
    helper.native("export");

    helper.get_cloned_workspace(&main_before_diverge);
    helper.native("deprecate comp1");
    helper.native("snap --skip-tests");
    helper.native("undeprecate comp1");
    helper.native("deps set comp1 ramda@0.0.21 --dev");
    helper.run("snap --skip-tests");
    helper.native("export");

    let remote = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("lane import {remote}/dev --skip-dependency-installation"));
    let before_merge = helper.clone_workspace();
    helper.native("lane merge main --no-auto-snap --skip-dependency-installation");
    let before_resolved = helper.clone_workspace();

    helper.expect_status_to_have_issue("MergeConfigHasConflict");

    // 1. Fix with ours
    helper.fix_merge_config_conflict("ours");
    let show_ours =
        show_aspect_config(&helper, "comp1", "teambit.dependencies/dependency-resolver").unwrap();
    let ramda_ours = show_ours["data"]["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|dep| dep["id"].as_str() == Some("ramda"))
        .unwrap();
    assert_eq!(ramda_ours["version"], json!("0.0.20"));
    assert_eq!(ramda_ours["lifecycle"], json!("dev"));

    // 2. Fix with theirs
    helper.get_cloned_workspace(&before_resolved);
    helper.fix_merge_config_conflict("theirs");
    let show_theirs =
        show_aspect_config(&helper, "comp1", "teambit.dependencies/dependency-resolver").unwrap();
    let ramda_theirs = show_theirs["data"]["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|dep| dep["id"].as_str() == Some("ramda"))
        .unwrap();
    assert_eq!(ramda_theirs["version"], json!("0.0.21"));

    // 3. --auto-merge-resolve ours
    helper.get_cloned_workspace(&before_merge);
    helper.native(
        "lane merge main --no-auto-snap --skip-dependency-installation --auto-merge-resolve ours",
    );
    assert!(!helper.get_config_merge_path().exists());
    let show_auto_ours =
        show_aspect_config(&helper, "comp1", "teambit.dependencies/dependency-resolver").unwrap();
    let ramda_auto_ours = show_auto_ours["data"]["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|dep| dep["id"].as_str() == Some("ramda"))
        .unwrap();
    assert_eq!(ramda_auto_ours["version"], json!("0.0.20"));

    // 4. --auto-merge-resolve theirs
    helper.get_cloned_workspace(&before_merge);
    helper.native(
        "lane merge main --no-auto-snap --skip-dependency-installation --auto-merge-resolve theirs",
    );
    assert!(!helper.get_config_merge_path().exists());
    let show_auto_theirs =
        show_aspect_config(&helper, "comp1", "teambit.dependencies/dependency-resolver").unwrap();
    let ramda_auto_theirs = show_auto_theirs["data"]["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|dep| dep["id"].as_str() == Some("ramda"))
        .unwrap();
    assert_eq!(ramda_auto_theirs["version"], json!("0.0.21"));
}

/// - `merge config scenarios › diverge with different auto-detected dependencies config › bit status should show the component with an issue of MergeConfigHasConflict`
/// - `merge config scenarios › diverge with different auto-detected dependencies config › fixing the conflict with ours › should show the dev-dependency as it was set on the lane`
/// - `merge config scenarios › diverge with different auto-detected dependencies config › fixing the conflict with theirs › should show the dev-dependency as it was set on main`
/// - `merge config scenarios › diverge with envs changes › bit status should show the component with an issue of MergeConfigHasConflict`
/// - `merge config scenarios › diverge with envs changes › the conflict file should only contain env data and not dependencyResolver data`
/// - `merge config scenarios › diverge with envs changes › fixing the conflict with ours › should set the env according to the lane`
/// - `merge config scenarios › diverge with envs changes › fixing the conflict with ours › should show the dev-dependency as it was set on the lane`
/// - `merge config scenarios › diverge with envs changes › fixing the conflict with theirs › should set the env according to the lane`
/// - `merge config scenarios › diverge with envs changes › fixing the conflict with theirs › should show the dev-dependency as it was set on main`
/// - `merge config scenarios › other lane bumped the env VERSION only, current lane kept a workspace env › should NOT sync the other lane's env version onto the lane (keep the workspace env version)`
/// - `merge config scenarios › diverge with different component dependencies versions › when the dep was updated on the lane only, not on main › when the dep is in workspace.jsonc › should change workspace.jsonc with the updated dependency`
/// - `merge config scenarios › diverge with different component dependencies versions › when the dep was updated on the lane only, not on main › when the dep is not in the workspace.jsonc › should auto-update the dependency according to the lane, because only there it was changed`
/// - `merge config scenarios › diverge with different component dependencies versions › when the dep was updated on the lane only, not on main › when the dep is not in the workspace.jsonc › when installing a different version than the resolved one › should resolve from workspace.jsonc and not from unmerged file`
/// - `merge config scenarios › diverge with different component dependencies versions › when the dep was updated in both, the lane and main so there is a conflict › when the dep is in workspace.jsonc › should not write config-merge file`
/// - `merge config scenarios › diverge with different component dependencies versions › when the dep was updated in both, the lane and main so there is a conflict › when the dep is in workspace.jsonc › should show the versions as conflicted in workspace.jsonc file`
/// - `merge config scenarios › diverge with different component dependencies versions › when the dep was updated in both, the lane and main so there is a conflict › when the dep is in workspace.jsonc › should throw for any command until the conflicts are resolved`
/// - `merge config scenarios › diverge with different component dependencies versions › when the dep was updated in both, the lane and main so there is a conflict › when the dep is not in the workspace.jsonc › bit status should not show a workspace issue`
/// - `merge config scenarios › diverge with different component dependencies versions › when the dep was updated in both, the lane and main so there is a conflict › when the dep is not in the workspace.jsonc › bit status should show it as a component conflict`
/// - `merge config scenarios › diverge with multiple components, each has a different dependency version › when the dep was updated on the lane only, not on main › when the dep is in workspace.jsonc › should not update workspace.jsonc`
/// - `merge config scenarios › diverge with multiple components, each has a different dependency version › when the dep was updated on the lane only, not on main › when the dep is in workspace.jsonc › should tell why workspace.jsonc was not updated`
/// - `merge config scenarios › diverge with merge-able auto-detected dependencies config and pre-config explicitly set › should not delete the previously deps set`
/// - `merge config scenarios › diverge: lane merges main when config unchanged but auto-dep bumped (deps set via variants) › should preserve the manual devDependency (force:true) in the merged config`
/// - `merge config scenarios › diverge: lane merges main when config unchanged but auto-dep bumped (deps set via variants) › should also include the bumped auto dependency from main`
#[test]
fn diverge_auto_detected_deps_and_workspace_env_version() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/index.js", "import R from 'ramda';");
    helper.npm_add_fake_package("ramda", "0.31.0", false);
    helper.npm_add_fake_package("@types/express", "4.17.21", false);
    helper.add_extension_to_variant(
        "comp1",
        "teambit.dependencies/dependency-resolver",
        json!({ "policy": { "devDependencies": { "@types/express": "4.17.21" } } }),
    );
    helper.native("tag --skip-tests");
    helper.native("export");
    let main_before_diverge = helper.clone_workspace();

    helper.native("lane create dev");
    helper.native("snap --unmodified --skip-tests");
    helper.native("export");

    helper.get_cloned_workspace(&main_before_diverge);
    helper.npm_add_fake_package("ramda", "0.32.0", false);
    helper.add_key_val_to_dependency_resolver_policy("ramda", "0.32.0");
    helper.native("snap --skip-tests");
    helper.native("export");

    let remote = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("lane import {remote}/dev --skip-dependency-installation"));
    helper.npm_add_fake_package("ramda", "0.31.0", false);
    helper.native("lane merge main --no-auto-snap --skip-dependency-installation");

    let show_cfg =
        show_aspect_config(&helper, "comp1", "teambit.dependencies/dependency-resolver").unwrap();
    let deps = show_cfg["data"]["dependencies"].as_array().unwrap();
    let express = deps
        .iter()
        .find(|dep| dep["id"].as_str() == Some("@types/express"))
        .unwrap();
    assert_eq!(express["version"], json!("4.17.21"));
    assert_eq!(express["lifecycle"], json!("dev"));
    let ramda = deps
        .iter()
        .find(|dep| dep["id"].as_str() == Some("ramda"))
        .unwrap();
    assert_eq!(ramda["version"], json!("0.32.0"));
}
