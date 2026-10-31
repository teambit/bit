//! `e2e/harmony/init-harmony.e2e.ts`.

use crate::helper::{Helper, config, remote};
use std::fs;

/// init command on Harmony › init --reset-new
#[test]
fn init_reset_new_resets_bitmap_and_clears_objects() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);
    helper.native("init --reset-new");

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some(""));
    assert_eq!(bitmap["comp1"]["scope"].as_str(), Some(""));

    let objects_dir = helper.scopes.local_path.join(".bit/objects");
    assert!(objects_dir.is_dir());
    assert_eq!(fs::read_dir(objects_dir).unwrap().count(), 0);
}

/// init command on Harmony › delete "objects" dir from the scope after initiating with git
#[test]
fn delete_objects_dir_after_initiating_with_git() {
    let helper = Helper::new();
    let local = &helper.scopes.local_path;
    let _ = fs::remove_dir_all(local);
    fs::create_dir_all(local.join(".git")).unwrap();
    helper.native("init --skip-interactive");
    helper.delete_path(".git/bit/objects");

    let status_err = helper.cmd("status");
    assert!(!status_err.status.success());
    let combined = format!("{}{}", status_err.stdout, status_err.stderr);
    assert!(combined.contains("scope not found at"), "{combined}");

    helper.native("init");
    let _ = helper.cmd("status");
    helper.run("status");
}

/// init command on Harmony › when workspace.jsonc exist, but not .bitmap nor .bit
/// init command on Harmony › workspace.jsonc is missing
/// init command on Harmony › init with an invalid default-scope
#[test]
fn init_missing_files_and_invalid_default_scope() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.delete_path(".bit");
    helper.delete_path(".bitmap");
    let install_err = helper.cmd("install");
    assert!(!install_err.status.success());
    let combined = format!("{}{}", install_err.stdout, install_err.stderr);
    assert!(combined.contains("fatal: unable to load the workspace"), "{combined}");

    helper.re_init_workspace();
    helper.delete_path("workspace.jsonc");
    helper.native("init");
    assert!(helper.scopes.local_path.join("workspace.jsonc").is_file());

    let _ = fs::remove_dir_all(&helper.scopes.local_path);
    fs::create_dir_all(&helper.scopes.local_path).unwrap();
    let invalid = helper.cmd("init --default-scope my.invalid.scope");
    assert!(!invalid.status.success());
    let invalid_combined = format!("{}{}", invalid.stdout, invalid.stderr);
    assert!(invalid_combined.contains("is invalid"), "{invalid_combined}");
    assert!(!helper.scopes.local_path.join("workspace.jsonc").exists());
}
