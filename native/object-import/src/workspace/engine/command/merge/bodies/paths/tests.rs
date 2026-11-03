//! Unit tests for merge destination path [`validate`] and [`canonical_relative`] checks ([`nested_native_destinations_validate_existing_and_new_merge_files`], [`native_components_do_not_relax_canonical_file_identity_guards`]) in `bit-object-import`.
//!
//! Checks nested merge destination validation via [`validate`] and [`canonical_relative`] inside [`Directory`] fixtures and rejects workspace root escapes.

use super::{canonical_relative, validate};
use crate::workspace::engine::command::scratch::Directory;
use std::{fs, path::Path};

/// Verifies that [`validate`] accepts existing and new nested component merge files and rejects workspace root escapes.
#[test]
fn nested_native_destinations_validate_existing_and_new_merge_files() {
    let root = Directory::create().unwrap();
    let directory = root.0.join("bar").join("src");
    fs::create_dir_all(&directory).unwrap();
    let existing = directory.join("existing.js");
    fs::write(&existing, "current").unwrap();
    assert!(validate(&root.0, &existing).is_ok());
    assert!(validate(&root.0, &directory.join("new.js")).is_ok());
    assert!(
        validate(
            &root.0,
            &root.0
                .join("new")
                .join("nested")
                .join("new.js")
        )
        .is_ok(),
    );
    assert!(validate(&root.0, &existing.join("child.js")).is_err());
    assert!(validate(&root.0, &root.0).is_err());
    assert!(validate(&root.0, &root.0.join("..").join("escape.js")).is_err());
}

/// Verifies that [`canonical_relative`] rejects empty, parent-traversal, absolute, `__proto__`, and colon-stream paths.
#[test]
fn native_components_do_not_relax_canonical_file_identity_guards() {
    for path in [
        "",
        "../escape.js",
        "./relative.js",
        "bar/./file.js",
        "/absolute.js",
        "C:/escape.js",
        "bar/__proto__/file.js",
        "bar/file:stream",
    ] {
        assert!(canonical_relative(Path::new(path)).is_err(), "{path}");
    }
    assert!(
        canonical_relative(
            Path::new("bar")
                .join("src")
                .join("file.js")
                .as_path()
        )
        .is_ok(),
    );
}

/// Verifies that [`canonical_relative`] rejects backslashes in filenames on non-Windows platforms.
#[cfg(not(windows))]
#[test]
fn backslashes_in_native_unix_filenames_remain_unsupported() {
    assert!(canonical_relative(Path::new(r"bar\file.js")).is_err());
}

/// Verifies that [`validate`] rejects merge destination [`Path`] targets in [`Directory`] that traverse through symlinks on Unix ([`canonical_relative`], [`nested_native_destinations_validate_existing_and_new_merge_files`]).
#[cfg(unix)]
#[test]
fn merge_destination_symlinks_remain_rejected() {
    let root = Directory::create().unwrap();
    let outside = Directory::create().unwrap();
    std::os::unix::fs::symlink(&outside.0, root.0.join("linked")).unwrap();
    assert!(validate(&root.0, &root.0.join("linked").join("file.js")).is_err());
}
