//! `e2e/harmony/lanes/remove-lanes.e2e.ts`.

use crate::helper::{Helper, len, parse, remote};

/// remove lanes › switching to a new lane and snapping
#[test]
fn remove_local_lanes() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("snap --message s1");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap comp1 --unmodified --message s2");
    let lane = parse(&helper.native("lane show dev --json"));
    assert_eq!(len(&lane["components"]), 1);
    let err_current = helper.cmd("lane remove dev -s");
    assert!(!err_current.status.success());
    assert!(format!("{}{}", err_current.stdout, err_current.stderr).contains(
        "unable to remove the currently used lane"
    ),);
    let err_main = helper.cmd("lane remove main -s");
    assert!(!err_main.status.success());
    assert!(format!("{}{}", err_main.stdout, err_main.stderr).contains(
        "unable to remove the default lane"
    ),);
    helper.native("switch main");
    let before_remove = helper.clone_workspace();
    let err_unmerged = helper.cmd("lane remove dev -s");
    assert!(!err_unmerged.status.success());
    assert!(format!("{}{}", err_unmerged.stdout, err_unmerged.stderr).contains(
        "unable to remove dev lane, it is not fully merged"
    ),);
    let out_force = helper.native("lane remove dev --force --silent");
    assert!(out_force.contains("successfully removed the following lane(s)"));
    assert!(!helper.native("lane list").contains("dev"));
    helper.get_cloned_workspace(&before_remove);
    let out_full =
        helper.native(&format!("lane remove {}/dev --force --silent", helper.scopes.remote));
    assert!(out_full.contains("successfully removed the following lane(s)"));
    helper.get_cloned_workspace(&before_remove);
    helper.native("lane merge dev --message merged");
    let out_merged = helper.native("lane remove dev --silent");
    assert!(out_merged.contains("successfully removed the following lane(s)"));
}

/// remove lanes › removing a remote lane
#[test]
fn remove_remote_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(3, true, "");
    helper.native("snap --message s1");
    remote::publish(&helper);
    let remote_lanes =
        parse(&helper.native(&format!("lane list --remote {} --json", helper.scopes.remote)));
    assert_eq!(len(&remote_lanes["lanes"]), 1);
    let err_unmerged =
        helper.native_run(&format!("lane remove {}/dev --remote --silent", helper.scopes.remote));
    assert!(!err_unmerged.status.success());
    let combined_unmerged = format!("{}{}", err_unmerged.stdout, err_unmerged.stderr);
    assert!(
        combined_unmerged.contains("unable to remove dev lane, it is not fully merged"),
        "{combined_unmerged}",
    );
    let out = helper.native(&format!(
        "lane remove {}/dev --remote --silent --force",
        helper.scopes.remote,
    ));
    assert!(out.contains("successfully removed"));
    let remote_after =
        parse(&helper.native(&format!("lane list --remote {} --json", helper.scopes.remote)));
    assert_eq!(len(&remote_after["lanes"]), 0);
    let err_again = helper.native_run(&format!(
        "lane remove {}/dev --remote --silent --force",
        helper.scopes.remote,
    ));
    assert!(!err_again.status.success());
    let combined_again = format!("{}{}", err_again.stdout, err_again.stderr);
    assert!(
        combined_again.contains("was not found")
            || combined_again.contains("remote lane not found"),
        "{combined_again}",
    );
}
