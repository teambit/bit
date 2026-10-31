//! `e2e/harmony/lanes/import-lanes.e2e.ts`.

use crate::helper::{Helper, config, parse};

/// import lanes › importing lanes › fetching lanes objects
#[test]
fn fetching_lanes_objects_without_writing_to_workspace() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("fetch {}/dev --lanes", helper.scopes.remote));

    assert!(!helper.scopes.local_path.join("components/bar/foo").exists());
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let comp_count = bitmap
        .as_object()
        .unwrap()
        .iter()
        .filter(|(k, v)| !k.starts_with('_') && v.is_object())
        .count();
    assert_eq!(comp_count, 0);

    let list = parse(&helper.native("list --local-scope --json"));
    assert_eq!(list.as_array().unwrap().len(), 3);
    assert!(helper.native("status").contains("nothing to tag or export"));
    helper.native("fetch --lanes");
}

/// import lanes › importing lanes › importing the lane and checking out by bit switch
/// import lanes › importing lanes › importing the lane and checking out with a different local lane-name
#[test]
fn importing_lane_and_checking_out_by_switch_and_with_alias() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");
    let lane_hash = parse(&helper.native("cat-lane dev"))["hash"]
        .as_str()
        .unwrap()
        .to_owned();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("switch {}/dev -x", helper.scopes.remote));
    helper.native("link");

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["_bit_lane"]["id"]["name"].as_str(), Some("dev"));
    assert_eq!(bitmap["_bit_lane"]["id"]["scope"].as_str(), Some(helper.scopes.remote.as_str()));
    assert_eq!(bitmap["_bit_lane"]["exported"].as_bool(), Some(true));
    assert_eq!(bitmap["comp1"]["isAvailableOnCurrentLane"].as_bool(), Some(true));
    assert_eq!(bitmap["comp2"]["isAvailableOnCurrentLane"].as_bool(), Some(true));
    assert_eq!(bitmap["comp1"]["onLanesOnly"].as_bool(), Some(true));
    assert_eq!(bitmap["comp2"]["onLanesOnly"].as_bool(), Some(true));

    let lane = parse(&helper.native("lane show dev --json"));
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert!(
        helper
            .native("lane list")
            .contains(&format!("current lane - {}/dev", helper.scopes.remote)),
    );
    assert_eq!(parse(&helper.native("cat-lane dev"))["hash"].as_str(), Some(lane_hash.as_str()));

    helper.native("switch main -x");
    let bitmap_main = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert!(bitmap_main.get("_bit_lane").is_none());
    assert_eq!(helper.native("lane current").trim(), "main");
    assert_eq!(bitmap_main["comp1"]["isAvailableOnCurrentLane"].as_bool(), Some(false));
    assert_eq!(bitmap_main["comp2"]["isAvailableOnCurrentLane"].as_bool(), Some(false));

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("switch {}/dev --alias my-new-lane -x", helper.scopes.remote));
    let aliased_lane = parse(&helper.native("lane show my-new-lane --json"));
    assert_eq!(
        aliased_lane["components"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );
    let lanes_json = parse(&helper.native("lane list --json"));
    assert_eq!(lanes_json["currentLane"].as_str(), Some("my-new-lane"));
    let bitmap_alias = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap_alias["_bit_lane"]["id"]["name"].as_str(), Some("dev"));
    assert_eq!(bitmap_alias["_bit_lane"]["exported"].as_bool(), Some(true));
}
