//! Preserve unrelated [`error`] values while translating proven blocked-parent [`mkdir_not_directory`] failures.
//!
//! Also verifies platform-specific package segment separators alongside [`error`] and [`mkdir_not_directory`] translation.
use super::{error, mkdir_not_directory};
use std::{io, path::Path};

/// Verifies that raw OS error `183` (`ERROR_ALREADY_EXISTS`) qualifies for [`mkdir_not_directory`] only on Windows.
#[test]
fn existing_windows_files_only_qualify_for_mkdir_translation_on_windows() {
    assert_eq!(mkdir_not_directory(&io::Error::from_raw_os_error(183)), cfg!(windows));
    assert!(mkdir_not_directory(&io::Error::from(io::ErrorKind::NotADirectory)));
    assert!(!mkdir_not_directory(&io::Error::other("callback failure")));
}

/// Verifies that [`error`] preserves the original OS error when no blocked parent path exists.
#[test]
fn without_a_proven_blocker_original_error_is_preserved() {
    let actual = error(Path::new("."), &[], io::Error::from_raw_os_error(183));
    assert_eq!(actual.raw_os_error(), Some(183));
}

/// Verifies that scoped package path components join using the host platform separator.
#[test]
fn package_segments_use_platform_separators() {
    let path: std::path::PathBuf = Path::new("@scope/second").components().collect();
    assert_eq!(path, Path::new("@scope").join("second"));
    assert_eq!(path.to_str().unwrap(), &format!("@scope{}second", std::path::MAIN_SEPARATOR));
}

/// Verifies that `PermissionDenied` does not qualify for [`mkdir_not_directory`] translation.
/// Ensures non-directory-collision errors remain untouched.
#[test]
fn permission_denied_error_does_not_qualify_for_mkdir_not_directory_translation() {
    assert!(!mkdir_not_directory(&io::Error::from(io::ErrorKind::PermissionDenied)));
}
