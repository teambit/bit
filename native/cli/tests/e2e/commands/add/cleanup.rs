//! End-to-end tests ensuring consumer destruction runs after successful links ([`compare`]), including no-added results, `.bitTmp` cleanup, and best-effort `.bitmap` history.
//!
//! Verifies `.bitTmp` removal on success and retention on pre-destruction link failure in [`workspace`].
use super::support::{compare, workspace};
use std::fs;

/// Verifies [`compare`] removes `.bitTmp` after successful and no-op `bit add` runs in [`workspace`].
#[test]
fn successful_and_no_added_tracking_clean_workspace_temporary_files() {
    let helper = workspace();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    helper.output_file(".bitTmp/nested/temporary", "temporary\n");
    assert!(compare(&helper, "add bar -i bar/foo").status.success());
    assert!(!helper.scopes.local_path.join(".bitTmp").exists());
    helper.output_file(".bitTmp", "another temporary\n");
    assert!(compare(&helper, "add bar -i bar/another").status.success());
    assert!(!helper.scopes.local_path.join(".bitTmp").exists());
}

/// Verifies that failed package links leave `.bitTmp` intact prior to consumer destruction.
#[test]
fn failed_links_leave_temporary_files_before_consumer_destruction() {
    let helper = workspace();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    helper.output_file(".bitTmp/nested/temporary", "temporary\n");
    helper.output_file(&format!("node_modules/@{}", helper.scopes.remote), "blocked\n");
    assert!(!compare(&helper, "add bar -i bar/foo").status.success());
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join(".bitTmp/nested/temporary")).unwrap(),
        "temporary\n",
    );
}

/// Verifies [`compare`] treats blocked `.bit/bitmap-history` writes as best-effort after `.bitTmp` cleanup.
#[test]
fn blocked_bitmap_history_is_best_effort_after_temporary_cleanup() {
    let helper = workspace();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    helper.output_file(".bitTmp/nested/temporary", "temporary\n");
    fs::remove_dir_all(helper.scopes.local_path.join(".bit/bitmap-history")).unwrap();
    helper.output_file(".bit/bitmap-history", "not a directory\n");
    assert!(compare(&helper, "add bar -i bar/foo").status.success());
    assert!(!helper.scopes.local_path.join(".bitTmp").exists());
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join(".bit/bitmap-history")).unwrap(),
        "not a directory\n",
    );
}
