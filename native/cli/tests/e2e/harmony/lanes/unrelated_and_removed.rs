//! `e2e/harmony/lanes/unrelated-and-removed.e2e.ts`.

use crate::helper::{Helper, parse};
use std::fs;

/// current lane a comp is removed, merging a lane that has this comp with different history
#[test]
fn removed_on_current_lane_merge_unrelated_takes_theirs_and_populates_unrelated() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create lane-a");
    helper.populate_components(1, false, "lane-a");
    helper.run("snap -m s1");
    helper.run("export");
    let head_on_lane_a = helper.head_of_lane("lane-a", "comp1");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native("lane create lane-b");
    helper.populate_components(1, false, "lane-b");
    helper.run("snap -m s1");
    helper.run("export");

    helper.run("delete comp1 --silent --lane");
    helper.run("snap -m s2");
    helper.run("export");
    let head_on_lane_b = helper.head_of_lane("lane-b", "comp1");

    helper.run(&format!("lane merge {}/lane-a --resolve-unrelated -x", helper.scopes.remote));

    let file_content = fs::read_to_string(
        helper.scopes.local_path.join(&helper.scopes.remote).join("comp1/index.js"),
    )
    .unwrap();
    assert!(file_content.contains("lane-a"));
    assert!(!file_content.contains("lane-b"));

    let ver = parse(&helper.native("cat-component comp1@latest --json"));
    assert_eq!(ver["unrelated"]["head"].as_str(), Some(head_on_lane_b.as_str()));
    assert_eq!(ver["unrelated"]["laneId"]["name"].as_str(), Some("lane-b"));
    assert_eq!(ver["parents"][0].as_str(), Some(head_on_lane_a.as_str()));
}
