//! `e2e/harmony/lanes/merge-lane-to-main-stale-dep-ref.e2e.ts`.

use crate::helper::Helper;

#[test]
fn stale_pinned_dependency_lives_in_another_scope_cross_scope_pin() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let new_scope = helper.create_new_remote_scope();
    let another_remote = new_scope.scope_name;
    let another_remote_path = new_scope.scope_path;
    helper.add_remote_scope_with(&another_remote_path);

    helper.populate_components(2, false, "");
    helper.native(&format!("scope set {another_remote} comp2"));
    helper.native("link --rewire");
    helper.run("compile");
    helper.native("tag --skip-tests");
    helper.run("export");

    let lane_scope = helper.create_new_remote_scope();
    let lane_scope_name = lane_scope.scope_name;
    helper.add_remote_scope_with(&lane_scope.scope_path);
    helper.native("lane create dev");
    helper.native(&format!("lane change-scope {lane_scope_name}"));

    helper.write_file("comp2/index.js", "module.exports = () => 'comp2 snapA';");
    helper.native("snap --skip-tests --unmodified");
    let comp2_snap_a = helper.get_head_from_lane("dev", "comp2");
    helper.run("export");

    helper.write_file("comp2/index.js", "module.exports = () => 'comp2 snapB';");
    helper.native("snap comp2 --skip-tests --skip-auto-snap");
    helper.native("export");

    helper.native("switch main -x");
    helper.native(&format!("lane merge {lane_scope_name}/dev -x"));

    // 1. the export should succeed — the remote integrity check skips cross-scope deps
    let export = helper.cmd("export");
    assert!(export.status.success(), "{export:?}");

    // 2. the stale snap should not exist on the dependency home scope, only on the lane scope
    let cat_on_home = Helper::cmd_in(&another_remote_path, &format!("cat-object {comp2_snap_a}"));
    assert!(!cat_on_home.status.success());

    // importing the dependent component later from a fresh workspace
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&another_remote_path);

    // 3. bit import of the dependent should work — the missing pinned dep version is tolerated
    let import_output = helper.native(&format!("import {}/comp1 -x", helper.scopes.remote));
    assert!(import_output.contains("successfully"));

    // 4. bit status should not report invalid components
    let status = helper.status_json();
    assert_eq!(
        status["invalidComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 5. bit import --dependencies should work — the missing pinned dep version is skipped silently
    let deps_import =
        helper.cmd(&format!("import {}/comp1 --dependencies --override -x", helper.scopes.remote));
    assert!(deps_import.status.success(), "{deps_import:?}");

    // 6. importing the pinned dep version explicitly should soft-fail as missing and not fetch it
    let out = helper.run(&format!("import {another_remote}/comp2@{comp2_snap_a} -x"));
    assert!(out.contains("missing components"));
    assert!(out.contains(&format!("{another_remote}/comp2")));
    let cat_ver = helper.cmd(&format!("cat-object {comp2_snap_a}"));
    assert!(!cat_ver.status.success());
}

#[test]
fn referenced_snap_is_only_on_the_lane_scope_fresh_import() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");

    let lane_scope = helper.create_new_remote_scope();
    let lane_scope_name = lane_scope.scope_name;
    let lane_scope_path = lane_scope.scope_path;
    helper.add_remote_scope_with(&lane_scope_path);
    helper.native("lane create dev");
    helper.native(&format!("lane change-scope {lane_scope_name}"));

    helper.write_file("comp2/index.js", "module.exports = () => 'comp2 snapA';");
    helper.native("snap --skip-tests --unmodified");
    let comp2_snap_a = helper.get_head_from_lane("dev", "comp2");
    helper.run("export");

    helper.write_file("comp2/index.js", "module.exports = () => 'comp2 snapB';");
    helper.native("snap comp2 --skip-tests --skip-auto-snap");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote_scope_with(&lane_scope_path);
    helper.native(&format!("lane import {lane_scope_name}/dev -x"));

    // 1. the referenced snap should not be present locally before the merge
    let cat_ver = helper.cmd(&format!("cat-object {comp2_snap_a}"));
    assert!(!cat_ver.status.success());

    // 2. the merge should import it from the lane scope and the export should succeed
    helper.native("switch main -x");
    helper.run(&format!("lane merge {lane_scope_name}/dev --ignore-config-changes -x"));
    let export = helper.cmd("export");
    assert!(export.status.success(), "{export:?}");
}
