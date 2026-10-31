//! `e2e/harmony/lanes/diverged-from-remote-lane.e2e.ts`.

use crate::helper::{Helper, parse};
use std::{thread, time::Duration};

#[test]
fn local_is_diverged_from_the_remote() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(1, false, "");
    helper.native("snap --skip-tests");
    helper.native("export");
    let before_diverge = helper.clone_workspace();
    helper.native("snap --skip-tests --unmodified");
    helper.native("export");

    // snap first then import
    helper.get_cloned_workspace(&before_diverge);
    helper.native("snap --skip-tests --unmodified");
    helper.run("import --objects");

    // 1. bit status should show it as merge-pending
    let status = helper.status_json();
    assert_eq!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    // 2. bit reset should not throw
    let reset = helper.native_run("reset comp1");
    assert!(reset.status.success(), "{reset:?}");

    // import first then snap
    helper.get_cloned_workspace(&before_diverge);
    let local_snap = helper.get_head_from_lane("dev", "comp1");
    helper.run("import --objects");
    helper.run("snap --skip-tests --unmodified");

    // 3. parent of the snap should be the previous local snap, not the remote snap
    let head_snap = helper.get_head_from_lane("dev", "comp1");
    let obj = parse(&helper.cat_object(&head_snap, false));
    assert_eq!(obj["parents"][0].as_str().unwrap(), local_snap);

    // 4. bit status should show it as merge-pending
    let status = helper.status_json();
    assert_eq!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}

#[test]
fn local_is_diverged_from_the_remote_and_another_lane_has_a_more_recent_snap() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(1, false, "");
    helper.native("snap --skip-tests");
    helper.native("export");
    let before_diverge = helper.clone_workspace();
    helper.native("snap --skip-tests --unmodified");
    helper.native("export");

    helper.get_cloned_workspace(&before_diverge);
    helper.populate_components(1, false, " v2");
    helper.native("snap --skip-tests");

    let after_snap_on_dev = helper.clone_workspace();

    // simulate the exact same file on another lane with a newer timestamp
    thread::sleep(Duration::from_millis(10));
    helper.native("switch main -x");
    helper.native("lane create dev2");
    helper.populate_components(1, false, " v2");
    helper.native("snap --skip-tests");
    helper.native("export");

    helper.get_cloned_workspace(&after_snap_on_dev);
    helper.run("import --objects");

    // bit status should show it as merge-pending
    let status = helper.status_json();
    assert_eq!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}
