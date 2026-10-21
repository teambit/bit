//! `e2e/harmony/lanes/lane-forking.e2e.ts`.

use crate::helper::Helper;

/// bit lane forking › multiple scopes - fork the lane and export to another scope › should be able to import the forked lane with no errors
#[test]
fn fork_lane_and_export_to_another_scope_then_import() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, another_remote_path) = helper.new_bare_scope_connected();
    helper.populate_components(2, true, "");
    helper.native("lane create lane-a");
    helper.run("snap -m snap");
    helper.run("export");

    helper.native(&format!("lane create lane-b --scope {another_remote} --fork-lane-new-scope"));
    helper.run("snap comp1 --unmodified -m snap");
    helper.run("export --fork-lane-new-scope");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&another_remote_path);
    helper.run(&format!("lane import {another_remote}/lane-b -x"));
}

/// bit lane forking › multiple scopes - fork the lane, then original lane progresses and squashed to main › should not throw `NoCommonSnap` on bit status
/// bit lane forking › multiple scopes - fork the lane, then original lane progresses and squashed to main › should be able to export with no error
#[test]
fn fork_lane_then_original_lane_progresses_and_squashed_to_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, _) = helper.new_bare_scope_connected();
    helper.populate_components(2, true, "");
    helper.native("lane create lane-a");
    helper.run("snap -m s1");
    helper.run("snap --unmodified -m s2");
    helper.run("export");

    helper.native(&format!("lane create lane-b --scope {another_remote} --fork-lane-new-scope"));
    let lane_b = helper.clone_workspace();
    helper.run("switch lane-a -x");
    helper.run("snap --unmodified -m s3");
    helper.run("snap --unmodified -m s4");
    helper.run("snap --unmodified -m s5");
    helper.run("export");
    helper.run("switch main -x");
    helper.run("lane merge lane-a -x");
    helper.run("export");

    helper.get_cloned_workspace(&lane_b);
    helper.run("import -x");
    helper.native("status");
    helper.run("export --fork-lane-new-scope --all");
}

/// bit lane forking › exporting a component on a lane when the staged snaps exist already on the remote (from another lane) › bit export should not throw
#[test]
fn export_component_on_lane_when_staged_snaps_already_exist_on_remote() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create lane-a");
    helper.populate_components(1, false, "");
    helper.run("snap -m snap-a");
    helper.run("export");
    helper.native("lane create lane-b");
    helper.run("export");
    let lane_a_first_snap = helper.clone_workspace();
    helper.run("switch lane-a -x");
    helper.run("snap --unmodified -m snap-x1");
    helper.run("snap --unmodified -m snap-x2");
    helper.run("export");

    helper.get_cloned_workspace(&lane_a_first_snap);
    helper.run("lane merge lane-a -x");
    helper.run("import -x");
    helper.run("fetch --lanes");
    helper.run("export");
}
