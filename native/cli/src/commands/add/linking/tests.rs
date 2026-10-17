//! Preserve unrelated errors while translating proven blocked-parent mkdir failures.
use super::{error, mkdir_not_directory};
use std::{io, path::Path};

#[test]
fn existing_windows_files_only_qualify_for_mkdir_translation_on_windows() {
    assert_eq!(mkdir_not_directory(&io::Error::from_raw_os_error(183)), cfg!(windows));
    assert!(mkdir_not_directory(&io::Error::from(io::ErrorKind::NotADirectory)));
    assert!(!mkdir_not_directory(&io::Error::other("callback failure")));
}

#[test]
fn without_a_proven_blocker_original_error_is_preserved() {
    let actual = error(Path::new("."), &[], io::Error::from_raw_os_error(183));
    assert_eq!(actual.raw_os_error(), Some(183));
}

#[test]
fn package_segments_use_platform_separators() {
    let path: std::path::PathBuf = Path::new("@scope/second").components().collect();
    assert_eq!(path, Path::new("@scope").join("second"));
    assert_eq!(path.to_str().unwrap(), &format!("@scope{}second", std::path::MAIN_SEPARATOR));
}
