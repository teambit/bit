//! Unit tests for default dev-file pattern matching ([`is_dev_file`]) and core aspect package naming ([`core_package_name`]) against [`MINIMATCH`].
//!
//! Verifies `minimatch` 3.0.5 fixture parity and `@teambit/` package name derivation.

use super::{core_package_name, dev_files::is_dev_file};

/// `[path, matchPatterns(path, defaults)]` from `minimatch` 3.0.5.
const MINIMATCH: &str = include_str!("minimatch_3_0_5.json");

/// Verifies [`is_dev_file`] matches every entry in [`MINIMATCH`].
#[test]
fn dev_files_match_minimatch() {
    let rows: Vec<(String, bool)> = serde_json::from_str(MINIMATCH).unwrap();
    for (path, expected) in rows {
        assert_eq!(is_dev_file(&path), expected, "{path:?}");
    }
}

#[test]
fn core_package_names() {
    assert_eq!(core_package_name("teambit.workspace/workspace"), "@teambit/workspace");
    assert_eq!(core_package_name("teambit.dependencies/pnpm"), "@teambit/pnpm");
    assert_eq!(core_package_name("teambit.a/b/c"), "@teambit/b.c");
}

#[test]
fn ordinary_source_file_is_not_classified_as_dev_file() {
    assert!(!is_dev_file("src/index.ts"));
}
