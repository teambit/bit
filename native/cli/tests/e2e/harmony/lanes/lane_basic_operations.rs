//! `e2e/harmony/lanes/lane-basic-operations.e2e.ts`.

use crate::helper::{Helper, config, parse, remote, strip_ansi};

/// bit lane basic operations › creating a new lane without any component
/// bit lane basic operations › bit lane current
#[test]
fn create_lane_without_component_and_lane_current() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);

    let main_current = helper.native("lane current");
    assert_eq!(main_current.trim(), "main");
    let main_json = parse(&helper.native("lane current --json"));
    assert_eq!(main_json["isDefault"].as_bool(), Some(true));
    assert_eq!(main_json["name"].as_str(), Some("main"));

    helper.native("lane create dev");
    let list_out = helper.native("lane list");
    assert!(list_out.contains("current lane - my-scope/dev"));
    assert!(list_out.contains("main"));

    let show_out = helper.native("lane show dev");
    assert!(show_out.contains("my-scope/dev"));

    let current_out = helper.native("lane current");
    assert!(current_out.trim().contains("/dev"));
    let current_json = parse(&helper.native("lane current --json"));
    assert_eq!(current_json["isDefault"].as_bool(), Some(false));
    assert_eq!(current_json["name"].as_str(), Some("dev"));
    assert!(current_json["scope"].is_string());

    let change_out = strip_ansi(&helper.native("lane change-scope my-remote"));
    assert!(change_out.contains(
        "the remote-scope of dev has been changed from my-scope to my-remote"
    ));
    let show_after = helper.native("lane show dev");
    assert!(show_after.contains("my-remote/dev"));
}

/// bit lane basic operations › main => lane => main => lane
/// bit lane basic operations › creating components on lanes, that do not exist on main
/// bit lane basic operations › creating a new lane to a different scope than main
#[test]
fn main_to_lane_switch_and_on_lanes_only() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("lane create dev");
    helper.run("snap --message s1");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["comp1"]["onLanesOnly"].as_bool(), Some(true));

    helper.native("switch main");
    helper.native("switch dev");

    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.run("add comp1");
    helper.native("lane create dev --scope some-scope");
}

/// bit lane basic operations › lane-a => lane-b
#[test]
fn lane_a_to_lane_b_to_lane_c() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag --message v1");
    remote::publish(&helper);
    helper.native("lane create lane-a");
    helper.populate_components(2, true, "v2");
    helper.run("snap --message s1");
    remote::publish(&helper);
    helper.native("lane create lane-b");

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

    helper.native("lane create lane-c");
    let lane_c = parse(&helper.run("cat-lane lane-c"));
    assert_eq!(lane_c["forkedFrom"]["name"].as_str(), Some("lane-a"));

    helper.native("switch lane-a");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["_bit_lane"]["exported"].as_bool(), Some(true));
}
