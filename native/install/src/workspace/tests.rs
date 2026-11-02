//! Unit tests ([`write`], [`components`], [`files`], [`matching`]) for workspace component loading, file scanning, and variant
//! pattern matching in `bit-install`.

/// Workspace component and `.bitmap` loading unit tests.
mod components;
mod files;
mod matching;

use std::{fs, path::Path};

/// Writes `files` (path → contents) under `root`, creating parent directories as needed.
fn write(root: &Path, files: &[(&str, &str)]) {
    for (path, contents) in files {
        let path = root.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }
}
