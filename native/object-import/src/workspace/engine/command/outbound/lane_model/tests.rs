//! Unit tests for outbound lane snap selection up to the remote head via [`lane_versions`] and [`model`] in `bit-object-import`.
//!
//! Ensures all unexported lane snaps are collected via [`write_version`], [`lane_versions`], and [`model`] ([`selects_every_unexported_lane_snap_and_stops_at_remote_head`]) and traversal stops at the remote head.

use super::{model, staged::lane_versions};
use serde_json::{Value, json};
use std::{fs, path::Path, time::SystemTime};

/// Encodes and writes a `Version` object for `hash` and `value` into the loose object store under `dir` via [`model::encode`].
fn write_version(dir: &Path, hash: &str, value: &Value) {
    fs::create_dir_all(dir.join(&hash[..2])).unwrap();
    fs::write(
        dir.join(&hash[..2]).join(&hash[2..]),
        model::encode(hash, "Version", value).unwrap(),
    )
    .unwrap();
}

/// Verifies that [`lane_versions`] selects every unexported lane snap written via [`write_version`] and stops traversal at the remote head.
#[test]
fn selects_every_unexported_lane_snap_and_stops_at_remote_head() {
    let unique = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("bit-lane-export-{}-{unique}", std::process::id()));
    fs::create_dir(&dir).unwrap();
    let main = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let older = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let head = "cccccccccccccccccccccccccccccccccccccccc";
    let lane = json!({"scope":"scope.one","name":"feature"});
    write_version(&dir, main, &json!({"parents":[]}));
    write_version(&dir, older, &json!({"parents":[main],"origin":{"lane":lane}}));
    write_version(&dir, head, &json!({"parents":[older],"origin":{"lane":lane}}));

    let first = lane_versions(&dir, head, None, "scope.one", "feature").unwrap();
    assert_eq!(first, [older, head]);
    let receipt_ids = first
        .iter()
        .map(|hash| format!("scope.one/item@{hash}"))
        .collect::<Vec<_>>();
    assert_eq!(receipt_ids, [format!("scope.one/item@{older}"), format!("scope.one/item@{head}")]);

    let next = lane_versions(&dir, head, Some(older), "scope.one", "feature").unwrap();
    assert_eq!(next, [head]);
    let repeat = lane_versions(&dir, head, Some(head), "scope.one", "feature").unwrap();
    assert!(repeat.is_empty());
    fs::remove_dir_all(dir).unwrap();
}
