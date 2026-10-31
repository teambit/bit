//! `e2e/harmony/lanes/lane-export-skip-main-history-http.e2e.ts`.

use crate::helper::{Helper, parse};

/// - `lane export skips main history — HTTP protocol › lane scope served over HTTP, components home scope on fs › the HTTP-served lane scope should hold the merge and lane snaps`
/// - `lane export skips main history — HTTP protocol › lane scope served over HTTP, components home scope on fs › the HTTP-served lane scope should NOT contain pre-lane main Version objects`
/// - `lane export skips main history — HTTP protocol › lane scope served over HTTP, components home scope on fs › fresh consumer imports the lane over HTTP › bit status should not throw`
/// - `lane export skips main history — HTTP protocol › lane scope served over HTTP, components home scope on fs › fresh consumer imports the lane over HTTP › bit log should reach into main history transparently (fetched from home scope)`
#[test]
fn lane_export_skips_main_history_separate_lane_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let lane_remote = helper.create_new_remote_scope();
    helper.add_remote_scope_with(&lane_remote.scope_path);

    helper.populate_components(1, true, "");
    helper.native("tag --skip-tests");
    let main_snap1 = helper.get_head("comp1");
    helper.native("tag --unmodified --skip-tests");
    let main_snap2 = helper.get_head("comp1");
    helper.native("export");

    helper.native(&format!("lane create dev --scope {}", lane_remote.scope_name));
    helper.native("snap --unmodified --skip-tests");
    let lane_snap = helper.get_head_from_lane("dev", "comp1");
    helper.native("export");
    let lane_ws = helper.clone_workspace();

    helper.native("switch main -x");
    helper.native("tag --unmodified --skip-tests");
    helper.native("export");
    helper.get_cloned_workspace(&lane_ws);
    helper.run("import -x");
    helper.native("lane merge main --auto-merge-resolve theirs -x");
    let merge_snap = helper.get_head_from_lane("dev", "comp1");
    helper.native("export");

    assert!(
        Helper::cmd_in(&lane_remote.scope_path, &format!("cat-object {merge_snap}"))
            .status
            .success(),
    );
    assert!(
        Helper::cmd_in(&lane_remote.scope_path, &format!("cat-object {lane_snap}"))
            .status
            .success(),
    );
    assert!(
        !Helper::cmd_in(&lane_remote.scope_path, &format!("cat-object {main_snap1}"))
            .status
            .success(),
    );

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&lane_remote.scope_path);
    helper.native(&format!("lane import {}/dev -x", lane_remote.scope_name));
    helper.native("status");
    let log = parse(&helper.run("log comp1 --json"));
    let hashes: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["hash"].as_str())
        .collect();
    assert!(hashes.contains(&merge_snap.as_str()));
    assert!(hashes.contains(&lane_snap.as_str()));
    assert!(hashes.contains(&main_snap1.as_str()));
    assert!(hashes.contains(&main_snap2.as_str()));
}
