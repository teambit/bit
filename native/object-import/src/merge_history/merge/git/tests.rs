//! Unit tests for [`workspace_merge_for_platform`] three-way text merge
//! conflict formatting in `bit-object-import` source merges ([`mixed_windows_newlines_keep_the_common_prefix_outside_conflict_markers`]).

use super::workspace_merge_for_platform;

/// Verifies that [`workspace_merge_for_platform`] keeps shared prefixes outside conflict markers with CRLF on Windows (`windows = true`).
#[test]
fn mixed_windows_newlines_keep_the_common_prefix_outside_conflict_markers() {
    let (merged, conflict) = workspace_merge_for_platform(
        b"shared\n// local\n",
        b"shared\r\n",
        b"shared\r\n// remote\n",
        ["current modified", "incoming"],
        true,
    )
    .unwrap();
    assert!(conflict);
    assert_eq!(merged, b"shared\r\n<<<<<<< current modified\r\n// local\r\n=======\r\n// remote\r\n>>>>>>> incoming\r\n");
}

/// Verifies that [`workspace_merge_for_platform`] emits LF conflict markers on Unix (`windows = false`) for mixed-newline three-way merges.
#[test]
fn the_same_merge_keeps_lf_output_on_unix() {
    let (merged, conflict) = workspace_merge_for_platform(
        b"shared\n// local\n",
        b"shared\r\n",
        b"shared\r\n// remote\n",
        ["current modified", "incoming"],
        false,
    )
    .unwrap();
    assert!(conflict);
    assert_eq!(
        merged,
        b"shared\n<<<<<<< current modified\n// local\n=======\n// remote\n>>>>>>> incoming\n",
    );
}
