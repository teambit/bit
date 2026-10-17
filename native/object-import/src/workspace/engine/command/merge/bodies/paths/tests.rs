use super::{canonical_relative, validate};
use crate::workspace::engine::command::scratch::Directory;
use std::{fs, path::Path};

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

#[cfg(not(windows))]
#[test]
fn backslashes_in_native_unix_filenames_remain_unsupported() {
    assert!(canonical_relative(Path::new(r"bar\file.js")).is_err());
}

#[cfg(unix)]
#[test]
fn merge_destination_symlinks_remain_rejected() {
    let root = Directory::create().unwrap();
    let outside = Directory::create().unwrap();
    std::os::unix::fs::symlink(&outside.0, root.0.join("linked")).unwrap();
    assert!(validate(&root.0, &root.0.join("linked").join("file.js")).is_err());
}
