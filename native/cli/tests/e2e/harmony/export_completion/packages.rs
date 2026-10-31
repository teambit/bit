//! Generated package bytes and source-link shapes stay observable after export.
use crate::helper::config;
use std::{fs, path::Path};

pub(super) fn compare(actual: &Path, expected: &Path) {
    let bitmap = config::read_jsonc(&expected.join(".bitmap"));
    for row in bitmap
        .as_object()
        .unwrap()
        .values()
        .filter(|row| row.get("rootDir").is_some())
    {
        let Some(scope) = row["scope"]
            .as_str()
            .or_else(|| row["defaultScope"].as_str())
        else {
            continue;
        };
        let name = row["name"].as_str().unwrap();
        let package = format!("node_modules/@{scope}/{}", name.replace('/', "."));
        compare_tree(&actual.join(&package), &expected.join(&package));
    }
}

fn compare_tree(actual: &Path, expected: &Path) {
    let read = |path| {
        fs::read_dir(path)
            .map(|entries| {
                let mut names = entries
                    .map(|entry| entry.unwrap().file_name())
                    .collect::<Vec<_>>();
                names.sort();
                names
            })
    };
    let names = read(expected);
    assert_eq!(read(actual).ok(), names.as_ref().ok().cloned(), "{}", actual.display());
    for name in names.into_iter().flatten() {
        let actual = actual.join(&name);
        let expected = expected.join(&name);
        let left = fs::symlink_metadata(&actual).unwrap();
        let right = fs::symlink_metadata(&expected).unwrap();
        assert_eq!(left.file_type().is_symlink(), right.file_type().is_symlink());
        if left.is_dir() && !left.file_type().is_symlink() {
            compare_tree(&actual, &expected);
        } else if actual.is_file() {
            assert_eq!(
                fs::read(&actual).unwrap(),
                fs::read(&expected).unwrap(),
                "{}",
                actual.display(),
            );
        }
    }
}
