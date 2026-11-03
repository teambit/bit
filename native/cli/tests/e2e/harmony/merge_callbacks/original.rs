//! Cache hits ([`copy`], [`timestamps`]) are compared at the same absolute workspace path, preserving file timestamps.
//! Verifies that `merge` with a warm filesystem cache matches the released CLI at the original path ([`component_merge_with_valid_cache_matches_at_the_original_workspace_path`]).

use super::{compare_results, fixture};
use crate::helper::{Helper, setup};
use std::{ffi::OsStr, fs, path::Path};

/// Verifies that `bit merge` with a warm filesystem cache matches Node at the original workspace path.
#[test]
fn component_merge_with_valid_cache_matches_at_the_original_workspace_path() {
    let helper = fixture::component_original();
    fixture::node(&helper, "status --json");
    let backup = tempfile::tempdir().unwrap();
    let before = backup.path().join("before");
    copy(&helper.scopes.local_path, &before);
    let command = "merge bar/foo --auto-merge-resolve theirs -m merged -x";
    let expected = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let oracle = helper.clone_workspace();
    fs::remove_dir_all(&helper.scopes.local_path).unwrap();
    copy(&before, &helper.scopes.local_path);
    // Restoring files changes ctime; the released status refreshes only cache metadata.
    fixture::node(&helper, "status --json");
    let actual = helper.native_run(command);
    compare_results(&helper, &oracle, &actual, &expected, true, false);
}

/// Copies directory tree `from` to `to` while preserving file modification timestamps.
fn copy(from: &Path, to: &Path) {
    setup::copy_dir(from, to);
    timestamps(from, to);
}
/// Recursively copies file modification timestamps from directory tree `from` onto `to` ([`copy`], [`Path`], [`timestamp_file`]).
fn timestamps(from: &Path, to: &Path) {
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        let metadata = entry.metadata().unwrap();
        if entry.file_type().unwrap().is_dir() {
            timestamps(&entry.path(), &target);
        } else if entry.file_type().unwrap().is_file() {
            timestamp_file(&target)
                .set_times(fs::FileTimes::new().set_modified(metadata.modified().unwrap()))
                .unwrap();
        }
    }
}

#[cfg(windows)]
fn timestamp_file(path: &Path) -> fs::File {
    use std::os::windows::fs::OpenOptionsExt;
    // FILE_WRITE_ATTRIBUTES is required for SetFileTime, including readonly files.
    fs::OpenOptions::new()
        .access_mode(0x0100)
        .open(path)
        .unwrap()
}
#[cfg(not(windows))]
fn timestamp_file(path: &Path) -> fs::File {
    fs::File::open(path).unwrap()
}
