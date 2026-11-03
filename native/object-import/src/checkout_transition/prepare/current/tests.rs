//! Unit tests for retained current workspace snapshot verification ([`Observation`], [`State`], [`digest`], [`observed`], [`load`]) during
//! checkout transition preparation in `bit-object-import`.

use super::{digest, wire};
use crate::workspace::snapshots::{Observation, State};

/// Retains `bytes` in a snapshot [`State`] and returns the corresponding [`wire::Current`] descriptor ([`Observation`], [`digest`]).
fn observed(bytes: &[u8]) -> (wire::Current, State) {
    let path = std::env::temp_dir().join("bit-retained-current-does-not-need-a-disk-file");
    let mut snapshots = State::default();
    let raw_hash = digest(&[b"\xef\xbb\xbf".as_slice(), bytes].concat());
    let snapshot_hash = digest(bytes);
    let read_token = snapshots.retain(Observation {
        path: path.clone(),
        raw_hash: raw_hash.clone(),
        snapshot_hash: snapshot_hash.clone(),
        raw_bytes: bytes.len() + 3,
        contents: bytes.into(),
    });
    (
        wire::Current {
            path,
            relative_path: "index.js".into(),
            raw_hash,
            snapshot_hash,
            read_token,
            source_hash: None,
            bitmap: false,
            protected: false,
        },
        snapshots,
    )
}

/// Verifies that [`load`] reads normalized bytes from the retained snapshot [`State`] without reopening disk files.
#[test]
fn retained_current_uses_the_observed_bytes_without_reopening_the_workspace() {
    let (file, snapshots) = observed(b"line\r\n");
    let mut total = 7;
    let output =
        load(&[file], &std::env::temp_dir(), &mut total, &mut 0, Some(&snapshots)).unwrap();
    assert_eq!(output[0].raw, b"line\r\n");
    assert_eq!(output[0].normalized, b"line\n");
    assert_eq!(total, 16);
}

/// Verifies that stale or mismatched snapshot observations fail immediately without falling back to disk reads.
#[test]
fn stale_or_mismatched_observations_never_fall_back_to_a_new_disk_read() {
    let (mut file, snapshots) = observed(b"original");
    file.snapshot_hash = "a".repeat(40);
    assert!(load(&[file], &std::env::temp_dir(), &mut 0, &mut 0, Some(&snapshots)).is_err());
    let (file, _) = observed(b"original");
    assert!(load(&[file], &std::env::temp_dir(), &mut 0, &mut 0, None).is_err());
    let (mut file, snapshots) = observed(b"original");
    file.source_hash = Some(file.raw_hash.clone());
    assert!(load(&[file], &std::env::temp_dir(), &mut 0, &mut 0, Some(&snapshots)).is_err());
}

/// Verifies that [`load`] counts the original UTF-8 BOM bytes on [`observed`] toward the whole-plan budget.
#[test]
fn retained_reads_count_the_original_bom_bytes_toward_the_whole_plan_budget() {
    let (file, snapshots) = observed(b"original");
    let mut total = 32 * 1024 * 1024 - 10;
    assert!(load(&[file], &std::env::temp_dir(), &mut total, &mut 0, Some(&snapshots)).is_err());
}

/// Loads `files` under `directory` using `snapshots` and no import overlay ([`observed`]).
pub(super) fn load(
    files: &[wire::Current],
    directory: &std::path::Path,
    total: &mut usize,
    compressed: &mut usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> std::io::Result<Vec<super::Loaded>> {
    super::load_with_overlay(files, directory, total, compressed, snapshots, None)
}
