//! Linking fails after object persistence and pending-state cleanup, before the final `.bitmap` write ([`failed_package_callback_preserves_the_published_objects_and_cleared_pending_prefix`]).
//! Verifies that a failing package callback during `lane merge` preserves published objects and cleared unmerged state.

use super::fixture;
use crate::helper::Helper;
use std::{ffi::OsStr, fs, path::Path};

/// Verifies that a failing package callback during `bit lane merge` preserves published objects and cleared unmerged state.
#[test]
fn failed_package_callback_preserves_the_published_objects_and_cleared_pending_prefix() {
    let helper = fixture::lane();
    helper.output_file("merge-package-fails", "reject");
    let oracle = helper.clone_workspace();
    let command = "lane merge dev --auto-merge-resolve theirs -m package -x";
    let actual = helper.native_run(command);
    let expected = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(actual.status.success(), "{} {}", actual.stdout, actual.stderr);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(
        fixture::output(&actual.stdout, &helper.scopes.local_path),
        fixture::output(&expected.stdout, &oracle),
    );
    assert_eq!(actual.stderr, expected.stderr);
    assert!(actual.stdout.contains("merge package rejected"));
    assert_eq!(actual.stdout.matches("merge package callback").count(), 1);
    for file in [".bitmap", ".bit/unmerged.json", "bar/foo.js"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(file)).unwrap(),
            fs::read(oracle.join(file)).unwrap(),
            "{file}",
        );
    }
    published(&helper.scopes.local_path);
    published(&oracle);
}

/// Asserts that `staged-snaps` objects exist on disk and `unmerged.json` is empty in `root`.
fn published(root: &Path) {
    let scope = bit_object_import::scope_path(root);
    let staged = fs::read_to_string(scope.join("staged-snaps")).unwrap();
    assert!(!staged.is_empty());
    for hash in staged.lines() {
        assert!(
            scope
                .join("objects")
                .join(&hash[..2])
                .join(&hash[2..])
                .exists(),
        );
    }
    let unmerged: serde_json::Value =
        serde_json::from_slice(&fs::read(scope.join("unmerged.json")).unwrap()).unwrap();
    assert_eq!(unmerged, serde_json::json!([]));
}
