//! `e2e/harmony/uninstall-cmd.e2e.ts`.

use crate::helper::Helper;

/// uninstall command › root policies removed › should remove packages from `node_modules` that were uninstalled
#[test]
fn should_remove_packages_from_node_modules_that_were_uninstalled() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.run("install is-positive@1.0.0 is-negative@1.0.0 is-odd@1.0.0");
    helper.native("uninstall is-positive is-negative");
    assert!(!helper.scopes.local_path.join("node_modules/is-positive").exists());
    assert!(!helper.scopes.local_path.join("node_modules/is-negative").exists());
}

/// uninstall command › root policies removed › should not remove packages from `node_modules` that were not uninstalled
#[test]
fn should_not_remove_packages_from_node_modules_that_were_not_uninstalled() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.run("install is-positive@1.0.0 is-negative@1.0.0 is-odd@1.0.0");
    helper.native("uninstall is-positive is-negative");
    assert!(helper.scopes.local_path.join("node_modules/is-odd").exists());
}
