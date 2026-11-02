//! End-to-end tests verifying published identity operations retain `.bitTmp` consumer temporary files, including successful noops ([`successful_move_retains_existing_consumer_temporary_files`]).
//!
//! Ensures `bit move`, `bit deprecate`, and `bit undeprecate` preserve unrelated consumer temp directories.

use super::support::{compare, successful, workspace};
use std::fs;

/// Verifies [`successful`] `bit move` retains existing `.bitTmp` consumer temporary files in [`workspace`].
#[test]
fn successful_move_retains_existing_consumer_temporary_files() {
    let helper = workspace(1, false);
    helper.output_file(".bitTmp/nested/temporary", "temporary\n");
    successful(&helper, "move comp1 moved");
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join(".bitTmp/nested/temporary")).unwrap(),
        "temporary\n",
    );
}

/// Verifies `bit deprecate` and `bit undeprecate` retain existing `.bitTmp` consumer temporary files.
#[test]
fn deprecation_changes_and_noops_retain_existing_consumer_temporary_files() {
    let helper = workspace(1, false);
    for command in ["deprecate comp1", "deprecate comp1", "undeprecate comp1", "undeprecate comp1"]
    {
        helper.output_file(".bitTmp/nested/temporary", "temporary\n");
        successful(&helper, command);
        assert_eq!(
            fs::read_to_string(helper.scopes.local_path.join(".bitTmp/nested/temporary")).unwrap(),
            "temporary\n",
        );
    }
}

/// Verifies a link failure during `bit move` retains `.bitTmp` files and preserves the prior `.bitmap`.
#[test]
fn move_link_failure_keeps_temporary_files_and_old_bitmap_after_relocation() {
    let helper = workspace(1, false);
    let root = &helper.scopes.local_path;
    let before = fs::read(root.join(".bitmap")).unwrap();
    helper.output_file(".bitTmp/nested/temporary", "temporary\n");
    let scope = format!("node_modules/@{}", helper.scopes.remote);
    fs::remove_dir_all(root.join(&scope)).unwrap();
    helper.output_file(&scope, "blocked\n");
    assert!(!compare(&helper, "move comp1 moved").status.success());
    assert!(root.join("moved/index.js").is_file());
    assert!(!root.join("comp1").exists());
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), before);
    assert_eq!(fs::read_to_string(root.join(".bitTmp/nested/temporary")).unwrap(), "temporary\n");
}
