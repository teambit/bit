//! `e2e/harmony/lanes/lane-management.e2e.ts`.

use crate::helper::{Helper, config, parse, remote};

/// bit lane management › rename an exported lane that has an alias
#[test]
fn rename_exported_lane_with_alias() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev --alias d");
    helper.populate_components(1, true, "");
    helper.run("snap --message s1");
    remote::publish(&helper);
    helper.run("lane rename new-lane");

    let lanes = helper.native("lane list");
    assert!(lanes.contains("new-lane"));
    assert!(!lanes.contains("dev"));

    let parsed = parse(&helper.native("lane list --json"));
    assert_eq!(parsed["currentLane"].as_str(), Some("new-lane"));

    helper.native("status");

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["_bit_lane"]["id"]["name"].as_str(), Some("new-lane"));

    let remote_before =
        parse(&helper.native(&format!("lane list --remote {} --json", helper.scopes.remote)));
    assert_eq!(
        remote_before["lanes"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(remote_before["lanes"][0]["name"].as_str(), Some("dev"));

    remote::publish(&helper);
    let remote_after =
        parse(&helper.native(&format!("lane list --remote {} --json", helper.scopes.remote)));
    assert_eq!(
        remote_after["lanes"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(remote_after["lanes"][0]["name"].as_str(), Some("new-lane"));
}

/// bit lane management › a new lane with a snapped component
#[test]
fn new_lane_with_snapped_component_and_change_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.run("add comp1");
    helper.run("snap --message s1");

    let details = helper.native("lane list --details");
    assert!(details.contains(&format!("current lane - {}/dev", helper.scopes.remote)));
    assert!(details.contains("comp1"));

    let invalid = helper.cmd("lane change-scope invalid.scope.name");
    assert!(!invalid.status.success());
    let combined = format!("{}{}", invalid.stdout, invalid.stderr);
    assert!(combined.contains("invalid.scope.name"), "{combined}");

    remote::publish(&helper);
    let exported_err = helper.cmd("lane change-scope new-scope");
    assert!(!exported_err.status.success());
    let exported_combined = format!("{}{}", exported_err.stdout, exported_err.stderr);
    assert!(
        exported_combined.contains("changing lane scope-name is allowed for new lanes only"),
        "{exported_combined}",
    );
}
