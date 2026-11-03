//! Unit tests ([`write`], [`components`], [`files`], [`matching`]) for workspace component loading, file scanning, and variant
//! pattern matching in `bit-install`.

/// Workspace component and `.bitmap` loading unit tests.
mod components;
/// Component file discovery and ignore rule rebasing unit tests.
mod files;
/// Variant pattern specificity and component package naming unit tests.
mod matching;

use std::{fs, path::Path};

/// Writes `files` (`path` → `contents`) under `root`, creating parent directories as needed for [`components`], [`files`], and [`matching`].
fn write(root: &Path, files: &[(&str, &str)]) {
    for (path, contents) in files {
        let path = root.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }
}
