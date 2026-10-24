//! `e2e/harmony/updates-from-main-and-lane.e2e.ts`.

use crate::helper::{Helper, parse};

/// - `updates from main and lane › updates are available from both main and lane › by default should only show updates from the current lane`
/// - `updates from main and lane › updates are available from both main and lane › with --lanes flag, should show updates from main`
/// - `updates from main and lane › updates are available from both main and lane › should show only one snap pending for comp2`
/// - `updates from main and lane › updates are available from both main and lane › bit checkout head › should update only components from the current lane`
/// - `updates from main and lane › updates are available from both main and lane › bit lane merge main › should update not only components belong to the main but also components that are available on the workspace and have updates from main`
#[test]
fn updates_available_from_both_main_and_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp1 --unmodified --skip-tests");
    helper.native("export");
    let scope_before_update = helper.clone_workspace();

    helper.native("snap comp1 --unmodified --skip-tests");
    helper.native("export");
    helper.native("switch main -x");
    helper.native("tag comp2 --unmodified --skip-tests");
    helper.native("export");

    helper.get_cloned_workspace(&scope_before_update);
    helper.run("import -x");

    // 1. Default status shows only updates from current lane
    let status = parse(&helper.run("status --json"));
    assert_eq!(
        status["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert!(
        status["outdatedComponents"][0]["id"]
            .as_str()
            .unwrap()
            .contains("comp1"),
    );
    assert_eq!(
        status["pendingUpdatesFromMain"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 2. With --lanes flag, shows updates from main
    let status_lanes = parse(&helper.run("status --lanes --json"));
    assert_eq!(
        status_lanes["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        status_lanes["pendingUpdatesFromMain"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    let comp2_pending = status_lanes["pendingUpdatesFromMain"]
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .unwrap()
                .contains("comp2")
        })
        .unwrap();
    assert_eq!(
        comp2_pending["divergeData"]["snapsOnTargetOnly"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    // 3. bit checkout head updates only components from current lane
    let checkout_out = helper.run("checkout head --skip-dependency-installation");
    assert!(checkout_out.contains("comp1"), "{checkout_out}");
    assert!(!checkout_out.contains("comp2"), "{checkout_out}");

    // 4. bit lane merge main --include-non-lane-comps updates both
    let merge_out = helper.run(
        "lane merge main --skip-dependency-installation --no-auto-snap --include-non-lane-comps",
    );
    assert!(merge_out.contains("Total Merged: 2"), "{merge_out}");
    let status_after = parse(&helper.native("status --lanes --json"));
    assert_eq!(
        status_after["pendingUpdatesFromMain"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
}
