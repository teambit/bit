//! `e2e/harmony/lanes/merge-lanes-diverge.e2e.ts`.

use crate::helper::{Helper, parse};
use std::path::PathBuf;

fn setup_diverged_lane() -> (Helper, String, PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create dev");
    helper.populate_components(2, true, "version2");
    helper.native("snap -m s1");
    helper.native("export");
    let ws_on_lane = helper.clone_workspace();
    helper.native("switch main -x");
    helper.populate_components(2, true, "version3");
    helper.native("snap -m s2");
    let comp2_head_on_main = helper.head(&format!("{}/comp2", helper.scopes.remote));
    helper.native("export");
    helper.get_cloned_workspace(&ws_on_lane);
    helper.run("import -x");
    let before_merge = helper.clone_workspace();
    (helper, comp2_head_on_main, before_merge)
}

/// merge lanes - diverge functionality › getting updates from main when lane is diverge
#[test]
fn getting_updates_from_main_when_lane_is_diverged() {
    let (helper, comp2_head_on_main, before_merge) = setup_diverged_lane();
    let head = helper.head(&format!("{}/comp2", helper.scopes.remote));
    assert_ne!(head, comp2_head_on_main);

    let status_lanes = helper.native("status --lanes");
    assert!(
        status_lanes.contains(&format!(
            "{}/comp1 ... main is ahead by 1 snaps",
            helper.scopes.remote
        )),
        "{status_lanes}",
    );

    helper.native("lane merge main --auto-merge-resolve theirs -x");
    let status = parse(&helper.native("status --json"));
    let after_merge_to_main = helper.clone_workspace();
    let comp2_id = format!("{}/comp2", helper.scopes.remote);
    let staged_comp2 = status["stagedComponents"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"].as_str() == Some(comp2_id.as_str()))
        .unwrap();
    let versions = staged_comp2["versions"].as_array().unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(versions[0].as_str(), Some(helper.head_of_lane("dev", "comp2").as_str()));
    assert_eq!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    helper.native("switch main -x");
    helper.native("lane merge dev --no-squash -x");
    let cat = parse(&helper.native("cat-component comp1@latest --json"));
    assert_eq!(cat["parents"].as_array().unwrap().len(), 2);
    helper.run("reset --all");

    helper.get_cloned_workspace(&after_merge_to_main);
    helper.native("switch main -x");
    let before_merge_head = helper.head("comp1");
    helper.native("lane merge dev -x");
    let cat_squashed = parse(&helper.native("cat-component comp1@latest --json"));
    assert_eq!(
        cat_squashed["parents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(cat_squashed["parents"][0].as_str(), Some(before_merge_head.as_str()));

    helper.get_cloned_workspace(&before_merge);
    helper.native("lane merge main --auto-merge-resolve theirs --no-auto-snap -x");
    let status_no_snap = parse(&helper.native("status --json"));
    assert_eq!(
        status_no_snap["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    let diff = crate::helper::strip_ansi(&helper.native("diff"));
    assert!(diff.contains("-module.exports = () => `comp1version2 and ${comp2()}`;"), "{diff}");
    assert!(diff.contains("+module.exports = () => `comp1version3 and ${comp2()}`;"), "{diff}");
}

/// merge lanes - diverge functionality › merge file changes from one lane to another
#[test]
fn merge_file_changes_from_one_lane_to_another() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");
    let author_scope = helper.clone_workspace();

    helper.native("lane create dev2");
    helper.populate_components(3, true, " v2");
    helper.output_file("comp1/new-file.ts", "");
    helper.native("snap -m s2");
    helper.native("export");

    helper.get_cloned_workspace(&author_scope);
    helper.native(&format!("lane merge {}/dev2 -x", helper.scopes.remote));
    helper.run("compile");

    assert!(helper.scopes.local_path.join("comp1/new-file.ts").exists());
    let comp1 = std::fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert!(comp1.contains("comp1 v2"));
}
