//! Unit tests for file history [`validate_file`] path traversal guards and [`file_hash`] duplicate rejection.
//!
//! Confirms that relative component paths cannot escape the component root or duplicate entries in `bit-object-import`.

use super::{file_hash, validate_file};
use serde_json::json;

#[test]
fn file_history_paths_cannot_escape_a_component() {
    assert!(validate_file("src/index.ts").is_ok());
    for path in ["../secrets", "/etc/passwd", "src/../secrets", r"src\index.ts", ""] {
        assert!(validate_file(path).is_err(), "{path}");
    }
}

#[test]
fn duplicate_version_file_paths_decline() {
    let hash = "a".repeat(40);
    let version = json!({"files":[
        {"relativePath":"src/index.ts","file":hash},
        {"relativePath":"src/index.ts","file":hash},
    ]});
    assert!(file_hash(&version, "src/index.ts").is_err());
}

#[test]
fn missing_file_in_version_returns_none_while_unique_match_returns_hash() {
    let hash = "a".repeat(40);
    let version = json!({"files":[{"relativePath":"src/index.ts","file":hash}]});
    assert_eq!(file_hash(&version, "src/index.ts").unwrap().as_deref(), Some(hash.as_str()));
    assert_eq!(file_hash(&version, "src/other.ts").unwrap(), None);
}
