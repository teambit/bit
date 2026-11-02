//! Unit tests for `fileStatus` target comparison, [`response`] payloads, and batch size limits in `bit-object-import`.
//!
//! Checks target-ordered unchanged flags via [`response`], invalid hash rejection, and batch count bounds in `bit-object-import`.

use serde_json::json;

use super::response;

/// Verifies that `fileStatus` [`response`] preserves target ordering and matches first-seen current file hashes.
#[test]
fn file_status_preserves_first_matches_target_order_and_raw_content_identity() {
    let first = json!({"relativePath":"same.js","hash":"a".repeat(40)});
    let second = json!({"relativePath":"same.js","hash":"b".repeat(40)});
    let missing = json!({"relativePath":"λ.js","hash":"a".repeat(40)});
    let result = response(&json!({
        "kind":"fileStatus", "target":[second,missing,first,first], "current":[first,second],
    }));
    assert_eq!(result["completed"], 4);
    assert_eq!(result["data"]["unchanged"], json!([false, false, true, true]));
}

/// Verifies that `fileStatus` [`response`] rejects malformed hashes and batches exceeding 4,096 targets.
#[test]
fn file_status_rejects_invalid_hashes_and_oversized_batches_without_a_prefix() {
    let file = json!({"relativePath":"file.js","hash":"a".repeat(40)});
    for target in [json!([file,{"relativePath":"bad.js","hash":"bad"}]), json!(vec![file; 4097])] {
        let result = response(&json!({"kind":"fileStatus", "target":target,"current":[]}));
        assert_eq!(result["completed"], 0);
        assert_eq!(result["failed"], true);
    }
    let empty = response(&json!({"kind":"fileStatus", "target":[],"current":[]}));
    assert_eq!(empty["data"]["unchanged"], json!([]));
}

/// Verifies that `fileStatus` [`response`] marks a target entry unchanged when both `relativePath` and `hash` match.
#[test]
fn file_status_marks_target_unchanged_only_when_path_and_hash_match() {
    let item = json!({"relativePath":"index.ts","hash":"c".repeat(40)});
    let result = response(&json!({"kind":"fileStatus","target":[item],"current":[item]}));
    assert_eq!(result["failed"], false);
    assert_eq!(result["data"]["unchanged"], json!([true]));
}
