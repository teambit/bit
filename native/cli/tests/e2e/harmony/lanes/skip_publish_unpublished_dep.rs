//! `e2e/harmony/lanes/skip-publish-unpublished-dep.e2e.ts`.

use crate::helper::Helper;

/// - `snap+build a dependent of an unmodified, built-but-unpublished dependency › builds the unpublished dependency from source instead of failing to install it`
#[test]
fn snap_dependent_of_unmodified_unpublished_dependency() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("lane create dev");
    helper.native("snap --skip-tests");
    helper.native("export");

    let output = helper.native("snap comp1 --unmodified --skip-tests -m snap-message");
    assert!(output.contains("component(s) snapped"), "{output}");
}
