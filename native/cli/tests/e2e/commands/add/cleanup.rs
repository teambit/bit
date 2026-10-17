//! Consumer destruction runs after successful links, including no-added results.
use super::support::{compare, workspace};
use std::fs;

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
