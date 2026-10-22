//! `e2e/harmony/lanes/lane-snapping.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, len, parse};

/// bit lane snapping and tagging › create a snap on main then on a new lane
/// bit lane snapping and tagging › tagging on a lane
#[test]
fn create_snap_on_main_then_on_new_lane_and_block_tag_on_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap -m s1");
    helper.native("export");
    helper.native("lane create dev");
    helper.create_component_bar_foo("module.exports = function foo() { return 'got foo v2'; };");
    helper.native("snap -m s2");

    let status = parse(&helper.native("status --json"));
    assert_eq!(len(&status["stagedComponents"]), 1);
    for key in [
        "importPendingComponents",
        "invalidComponents",
        "modifiedComponents",
        "newComponents",
        "outdatedComponents",
    ] {
        assert_eq!(len(&status[key]), 0);
    }

    let log = helper.native("log bar/foo");
    let main_snap = helper.head("bar/foo");
    let dev_snap = helper.head_of_lane("dev", "bar/foo");
    assert!(log.contains(&main_snap), "{log}");
    assert!(log.contains(&dev_snap), "{log}");

    let log_parents = helper.native("log bar/foo --parents");
    assert!(log_parents.contains(&format!("Parent(s): {}", &main_snap[..9])), "{log_parents}");

    helper.create_component_bar_foo("module.exports = function foo() { return 'got foo v3'; };");
    let tag_run = helper.cmd("tag bar/foo");
    assert!(!tag_run.status.success());
    let combined = format!("{}{}", tag_run.stdout, tag_run.stderr);
    assert!(
        combined.contains(
            "unable to tag when checked out to a lane, please switch to main, merge the lane and then tag again"
        ),
        "{combined}",
    );
}

/// bit lane snapping and tagging › auto-snap when on a lane
#[test]
fn auto_snap_when_on_a_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(3, true, "");
    helper.native("snap -m s1");
    helper.output_file("comp3/index.js", "module.exports = () => 'comp3 v2';");
    let status_out = helper.native("status");
    assert!(status_out.contains("components pending auto-tag"), "{status_out}");
    let snap_out = helper.native("snap comp3 -m s2");
    assert!(snap_out.contains("auto-snapped dependents"), "{snap_out}");
    let comp3_head = helper.head_of_lane("dev", "comp3");
    let comp2_head = helper.head_of_lane("dev", "comp2");
    let comp1_head = helper.head_of_lane("dev", "comp1");
    let comp2_obj = parse(&helper.native(&format!("cat-component comp2@{comp2_head} --json")));
    assert_eq!(comp2_obj["dependencies"][0]["id"]["name"].as_str(), Some("comp3"));
    assert_eq!(comp2_obj["dependencies"][0]["id"]["version"].as_str(), Some(comp3_head.as_str()));
    let comp1_obj = parse(&helper.native(&format!("cat-component comp1@{comp1_head} --json")));
    assert_eq!(comp1_obj["dependencies"][0]["id"]["name"].as_str(), Some("comp2"));
    assert_eq!(comp1_obj["dependencies"][0]["id"]["version"].as_str(), Some(comp2_head.as_str()));
    let flat = comp1_obj["flattenedDependencies"].as_array().unwrap();
    assert!(
        flat.iter()
            .any(|dep| dep["name"] == "comp3" && dep["version"] == comp3_head),
    );
    assert!(
        flat.iter()
            .any(|dep| dep["name"] == "comp2" && dep["version"] == comp2_head),
    );
    let status = parse(&helper.native("status --json"));
    assert_eq!(len(&status["modifiedComponents"]), 0);
    assert_eq!(len(&status["stagedComponents"]), 3);
}

/// bit lane snapping and tagging › snapping and un-tagging on a lane
/// bit lane snapping and tagging › bit checkout to a previous snap
#[test]
fn snapping_and_untagging_on_lane_and_checkout_previous_snap() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    let after_first_snap = helper.clone_workspace();
    let reset_out = helper.native("reset --all");
    assert!(reset_out.contains("1 component(s) reset successfully"), "{reset_out}");
    assert_eq!(len(&parse(&helper.native("status --json"))["newComponents"]), 1);
    assert_eq!(len(&parse(&helper.native("lane show dev --json"))["components"]), 0);
    assert_eq!(parse(&helper.native("list --json"))[0]["currentVersion"].as_str(), Some("N/A"));

    helper.run("switch main -x");
    assert_eq!(len(&parse(&helper.native("status --json"))["newComponents"]), 1);

    helper.get_cloned_workspace(&after_first_snap);
    let first_snap = helper.head_of_lane("dev", "comp1");
    helper.native("snap comp1 --unmodified -m s2");
    helper.native("reset comp1 --head");
    let after_head_reset = parse(&helper.native("status --json"));
    assert_eq!(len(&after_head_reset["newComponents"]), 0);
    assert_eq!(len(&after_head_reset["stagedComponents"]), 1);

    helper.get_cloned_workspace(&after_first_snap);
    helper.native("reset comp1");

    helper.get_cloned_workspace(&after_first_snap);
    helper.populate_components(1, true, "v2");
    helper.native("snap comp1 -m s2");
    let second_snap = helper.head_of_lane("dev", "comp1");
    helper.native(&format!("checkout {first_snap} comp1 -x"));
    assert_eq!(len(&parse(&helper.run("status --json"))["modifiedComponents"]), 0);
    let co_list = parse(&helper.native("list --json"));
    assert_eq!(co_list[0]["currentVersion"].as_str(), Some(first_snap.as_str()));
    assert_eq!(co_list[0]["localVersion"].as_str(), Some(second_snap.as_str()));
}
