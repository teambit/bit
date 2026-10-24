mod components;
mod files;
mod matching;

use std::{fs, path::Path};

/// Write `files` (path → contents) under `root`, creating parents.
fn write(root: &Path, files: &[(&str, &str)]) {
    for (path, contents) in files {
        let path = root.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }
}
