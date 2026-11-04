//! Unit tests for `fileStatus` target comparison, [`response`] payloads, and batch size limits in `bit-object-import`.
//!
//! Checks target-ordered unchanged flags via [`response`] ([`file_status_preserves_first_matches_target_order_and_raw_content_identity`], [`file_status_marks_target_unchanged_only_when_path_and_hash_match`]), invalid hash rejection ([`file_status_rejects_invalid_hashes_and_oversized_batches_without_a_prefix`]), and batch count bounds.

use serde_json::json;

use super::{Directory, response, source};

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

/// Verifies that `fileStatus` [`response`] marks a target entry unchanged ([`json`]) when both `relativePath` and `hash` match.
#[test]
fn file_status_marks_target_unchanged_only_when_path_and_hash_match() {
    let item = json!({"relativePath":"index.ts","hash":"c".repeat(40)});
    let result = response(&json!({"kind":"fileStatus","target":[item],"current":[item]}));
    assert_eq!(result["failed"], false);
    assert_eq!(result["data"]["unchanged"], json!([true]));
}

/// Saved transitive graphs may exceed both 4,096 nodes and 16,384 edges.
#[test]
fn status_graph_reads_large_inline_and_referenced_saved_graphs() {
    let directory = Directory::new();
    let edges = (0..5000)
        .flat_map(|node| {
            (1..=6).map(move |offset| {
                json!({
                    "source": format!("sample.scope/item-{node}@1.0.0"),
                    "target": format!("sample.scope/item-{}@1.0.0", (node + offset) % 5000),
                })
            })
        })
        .collect::<Vec<_>>();
    let stored = source(&directory, &serde_json::to_vec(&edges).unwrap());
    let hash = stored["hash"].as_str().unwrap();
    let object_path = format!("{}/{}", &hash[..2], &hash[2..]);
    directory.write(
        &format!(".bit/objects/{object_path}"),
        &std::fs::read(directory.0.join(&object_path)).unwrap(),
    );
    for version in [json!({"flattenedEdges":edges}), json!({"flattenedEdgesRef":stored["hash"]})] {
        let result = response(&json!({
            "kind":"statusGraph", "root":directory.0,
            "versions":[["a".repeat(40),version]],
            "components":[{"identity":"sample.scope/app@1.0.0", "dependencies":["sample.scope/item-0@1.0.0"]}],
        }));
        assert_eq!(result["failed"], false, "{result}");
        let external = result["data"]["external"].as_array().unwrap();
        assert_eq!(external.len(), 5000);
        assert_eq!(
            external
                .iter()
                .map(|row| row["dependencies"]
                    .as_array()
                    .unwrap()
                    .len())
                .sum::<usize>(),
            30_000,
        );
        assert_eq!(
            external[0]["dependencies"],
            json!(
                (1..=6)
                    .map(|node| format!("sample.scope/item-{node}@1.0.0"))
                    .collect::<Vec<_>>()
            ),
        );
    }
}
