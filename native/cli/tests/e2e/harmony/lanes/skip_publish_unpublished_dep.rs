//! Port of `e2e/harmony/lanes/skip-publish-unpublished-dep.e2e.ts` for snapping with unpublished dependencies ([`SNAP_MSG`], [`snap_dependent_of_unmodified_unpublished_dependency`]).
//!
//! Verifies snapping a dependent when its dependency is built on a lane rather than published.

use crate::helper::Helper;

/// Snap message passed when snapping `comp1` with an unpublished lane dependency.
const SNAP_MSG: &str = "snap-message";

/// Verifies snapping a dependent component on a lane when its unmodified dependency has not been published as a package ([`SNAP_MSG`]).
#[test]
fn snap_dependent_of_unmodified_unpublished_dependency() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("lane create dev");
    helper.native("snap --skip-tests");
    helper.native("export");

    let output = helper.native(&format!("snap comp1 --unmodified --skip-tests -m {SNAP_MSG}"));
    assert!(output.contains("component(s) snapped"), "{output}");
}
