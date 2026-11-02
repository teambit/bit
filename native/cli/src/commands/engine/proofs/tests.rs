//! Unit tests for read-set proof validation and [`MAX_PROOFS`] frame batching in [`Engine`] requests.
//!
//! Verifies stale-receipt detection across multi-frame batches and per-observation ordering.

use super::{Engine, MAX_PROOFS};
use serde_json::json;
use std::fs;

/// Verifies that [`Engine::validate_read_set`] rejects a stale receipt located in a trailing frame batch.
#[test]
fn a_stale_receipt_in_the_last_frame_is_still_rejected() {
    let directory = tempfile::tempdir().unwrap();
    let proofs = (0..=MAX_PROOFS)
        .map(|index| json!({"path":directory.path().join(index.to_string()),"hash":null}))
        .collect::<Vec<_>>();
    fs::write(directory.path().join(MAX_PROOFS.to_string()), b"changed").unwrap();
    let error = Engine::new()
        .unwrap()
        .validate_read_set(&proofs, "test stale receipt")
        .unwrap_err();
    assert!(error.to_string().contains("dependency capture changed"), "{error}");
}

/// Verifies that conflicting observations of the same path are not deduplicated before verification.
#[test]
fn different_observations_of_one_path_are_not_deduplicated() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("absent");
    let proofs = [json!({"path":path,"hash":null}), json!({"path":path,"hash":"0".repeat(64)})];
    let error = Engine::new()
        .unwrap()
        .validate_read_set(&proofs, "test stale receipt")
        .unwrap_err();
    assert!(error.to_string().contains("dependency capture changed"), "{error}");
}

/// Verifies that [`Engine::validate_read_set`] succeeds immediately on empty or null-only proof slices.
/// Ensures no worker IPC roundtrip is required when no concrete proofs exist.
#[test]
fn empty_and_null_only_proof_slices_succeed_without_engine_roundtrip() {
    let mut engine = Engine::new().unwrap();
    engine
        .validate_read_set(&[], "unused")
        .unwrap();
    engine
        .validate_read_set(&[json!(null), json!(null)], "unused")
        .unwrap();
}
