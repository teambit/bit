//! `e2e/harmony/lanes/multiple-comps-same-name-on-lane.e2e.ts`.

use crate::helper::{Helper, config, parse};
use serde_json::json;

/// lane with multiple components with the same name but different scope-name
#[test]
fn multiple_components_with_same_name_on_lane_keep_both_and_import() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, another_remote_path) = helper.new_bare_scope();

    helper.populate_components(2, true, "");
    helper.native("lane create lane-a");
    helper.native("snap -m s1");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&another_remote_path);
    Helper::add_remote_to(&another_remote_path, &helper.scopes.remote_path);
    Helper::add_remote_to(&helper.scopes.remote_path, &another_remote_path);
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        json!(&another_remote),
    );
    helper.populate_components(1, true, "");
    helper.native("snap -m s1");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&another_remote_path);
    helper.native(&format!(
        "lane import {}/lane-a --pattern {}/comp2 -x",
        helper.scopes.remote, helper.scopes.remote,
    ));
    helper.native(&format!("import {another_remote}/comp1 -x"));
    helper.native("snap --unmodified -m s2");
    helper.native("export");

    let remote_lane = Helper::cmd_in(&helper.scopes.remote_path, "cat-lane lane-a");
    assert!(remote_lane.status.success(), "{remote_lane:?}");
    let lane = parse(&remote_lane.stdout);
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&another_remote_path);
    helper.native(&format!("lane import {}/lane-a -x", helper.scopes.remote));
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["invalidComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!(
        "lane import {}/lane-a --pattern !{another_remote}/comp1 -x",
        helper.scopes.remote,
    ));
}
