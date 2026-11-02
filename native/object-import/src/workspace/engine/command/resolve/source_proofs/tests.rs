//! Unit tests for retaining BOM-stripped source observation [`proof`]s via [`retain`] until publication.
//!
//! Ensures captured BOM-prefixed sources in [`snapshots`] remain bound to their raw on-disk hash via [`retain`] and [`proof`] until commit.

use super::{proof, retain, snapshots};
use serde_json::json;

/// Verifies that [`retain`] binds BOM-stripped source observations in [`snapshots`] to their raw on-disk hash via [`proof`].
#[test]
fn captured_bom_source_remains_bound_until_publication() {
    let root = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let path = root.0.join("index.js");
    let raw = b"\xef\xbb\xbfexports.value = 1;\r\n";
    std::fs::write(&path, raw).unwrap();
    let hash = crate::workspace::engine::hash(raw);
    let mut snapshots = snapshots::State::default();
    let token = snapshots
        .retain(snapshots::Observation {
            path: path.clone(),
            raw_hash: hash.clone(),
            snapshot_hash: crate::workspace::engine::hash(&raw[3..]),
            raw_bytes: raw.len(),
            contents: raw[3..].to_vec().into(),
        })
        .unwrap();
    let retained =
        retain(&json!({"path":path,"rawHash":hash,"readToken":token}), &snapshots).unwrap();
    proof::verify(std::slice::from_ref(&retained)).unwrap();
    std::fs::write(&path, b"exports.value = 2;\n").unwrap();
    assert!(proof::verify(&[retained]).is_err());
}

/// Verifies that [`retain`] rejects mismatched `rawHash` values or unknown observation `readToken` IDs.
#[test]
fn mismatched_raw_hash_or_missing_token_is_rejected_during_retain() {
    let root = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let path = root.0.join("index.js");
    let raw = b"exports.value = 1;\n";
    std::fs::write(&path, raw).unwrap();
    let hash = crate::workspace::engine::hash(raw);
    let mut snapshots = snapshots::State::default();
    let token = snapshots
        .retain(snapshots::Observation {
            path: path.clone(),
            raw_hash: hash,
            snapshot_hash: crate::workspace::engine::hash(raw),
            raw_bytes: raw.len(),
            contents: raw.to_vec().into(),
        })
        .unwrap();
    assert!(
        retain(&json!({"path":path,"rawHash":"0".repeat(40),"readToken":token}), &snapshots)
            .is_err(),
    );
    assert!(
        retain(&json!({"path":path,"rawHash":"0".repeat(40),"readToken":999}), &snapshots).is_err(),
    );
}
