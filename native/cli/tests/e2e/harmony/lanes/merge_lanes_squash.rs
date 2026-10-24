//! `e2e/harmony/lanes/merge-lanes-squash.e2e.ts`.

use crate::helper::{Helper, parse};

/// merge lanes - squash functionality › merge with squash › when the lane is ahead by only 1 snap, so there is nothing to squash
/// merge lanes - squash functionality › merge with squash › when the lane is ahead by 3 snaps
#[test]
fn merge_with_squash_one_snap_and_three_snaps() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag -m v1");
    let head_on_main = helper.head("comp1");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap --unmodified -m s1");
    let after_first_snap = helper.clone_workspace();

    let head_on_lane_1 = helper.head_of_lane("dev", "comp1");
    helper.native("switch main -x");
    helper.native("lane merge dev -x");
    let head_obj = parse(&helper.native(&format!("cat-component comp1@{head_on_lane_1} --json")));
    assert!(head_obj.get("squashed").is_none());
    assert_eq!(
        head_obj["modified"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    helper.get_cloned_workspace(&after_first_snap);
    helper.native("snap --unmodified -m s2");
    helper.native("snap --unmodified -m s3");
    let head_on_lane_3 = helper.head_of_lane("dev", "comp1");
    helper.native("switch main -x");
    helper.native("lane merge dev -x");

    let log = parse(&helper.native("log comp1 --json"));
    let log_arr = log.as_array().unwrap();
    assert_eq!(log_arr.len(), 2);
    assert_eq!(log_arr[0]["hash"].as_str(), Some(head_on_main.as_str()));
    assert_eq!(log_arr[1]["hash"].as_str(), Some(head_on_lane_3.as_str()));
    assert_eq!(log_arr[1]["parents"][0].as_str(), Some(head_on_main.as_str()));
}

/// merge lanes - squash functionality › merge with squash after exporting and importing the lane to a new workspace
#[test]
fn merge_with_squash_after_exporting_and_importing_lane_to_new_workspace() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(3, true, "");
    helper.native("snap -m s1");
    helper.native("snap --unmodified -m s2");
    helper.native("snap --unmodified -m s3");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!(
        "lane merge {}/dev --skip-dependency-installation",
        helper.scopes.remote,
    ));

    helper.run("import -x");
    let status = parse(&helper.native("status --json"));
    let staged = status["stagedComponents"].as_array().unwrap();
    assert_eq!(
        staged[0]["versions"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    helper.run("export");
    let vh_run = Helper::cmd_in(
        &helper.scopes.remote_path,
        &format!("cat-version-history {}/comp1 --json", helper.scopes.remote),
    );
    assert!(vh_run.status.success(), "{vh_run:?}");
    let vh = parse(&vh_run.stdout);
    let head = helper.head(&format!("{}/comp1", helper.scopes.remote));
    let head_ver = vh["versions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ver| ver["hash"].as_str() == Some(head.as_str()))
        .unwrap();
    assert_eq!(
        head_ver["parents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        head_ver["squashed"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}
