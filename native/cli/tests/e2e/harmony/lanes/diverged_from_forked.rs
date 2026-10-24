//! `e2e/harmony/lanes/diverged-from-forked.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn lane_b_was_forked_from_lane_a_and_they_are_now_diverged() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_lane("lane-a", "");
    helper.populate_components(1, false, "");
    helper.native("snap --skip-tests");
    helper.native("export");
    helper.create_lane("lane-b", "");
    helper.native("snap --skip-tests --unmodified");
    helper.native("export");
    helper.switch_local_lane("lane-a", "");
    helper.write_file("comp1/new-file.ts", "");
    helper.native("snap --skip-tests");
    let head_on_lane_a = helper.get_head_from_lane("lane-a", "comp1");
    helper.native("export");
    helper.switch_local_lane("lane-b", "");
    let head_on_lane_b = helper.get_head_from_lane("lane-b", "comp1");

    // 1. bit status should have the diverged component in the updatesFromForked section
    let status = parse(&helper.run_cmd("status --json --lanes"));
    assert_eq!(
        status["updatesFromForked"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    // 2. the file added on lane-a should not be on the filesystem while on lane-b
    assert!(!helper.scopes.local_path.join("comp1/new-file.ts").exists());

    // merging lane-a into lane-b
    let remote = &helper.scopes.remote;
    helper.merge_lane(&format!("{remote}/lane-a"), "");

    // 3. should keep both parents (current lane first, merged lane second) and record no squash data
    let new_head = helper.get_head_from_lane("lane-b", "comp1");
    let cat = parse(&helper.cat_component(&format!("{remote}/comp1@{new_head}")));
    assert_eq!(cat["parents"], serde_json::json!([head_on_lane_b, head_on_lane_a]));
    assert!(cat.get("squashed").is_none() || cat["squashed"].is_null());

    // 4. should write the file that was newly added on lane-a
    assert!(helper.scopes.local_path.join("comp1/new-file.ts").exists());
}
