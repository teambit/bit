//! Unit tests for control file [`refresh`] and [`bounded_proof`] preimage proofs and symlink rejection.
//!
//! Verifies missing-file hash representation, size-budget enforcement, and non-regular file rejection.

use super::{bounded_proof, refresh};
use std::fs;

/// Verifies that [`refresh`] and [`bounded_proof`] record absence and reject non-regular or oversized files.
#[test]
fn controls_retain_absence_and_reject_nonregular_or_over_budget_files() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("component.json");
    assert!(refresh(&path).unwrap()["hash"].is_null());
    fs::write(&path, "{}").unwrap();
    let first = refresh(&path).unwrap();
    assert_eq!(first, bit_install::policy::scope::read_proof(&path).unwrap());
    fs::write(&path, r#"{"changed":true}"#).unwrap();
    assert_ne!(refresh(&path).unwrap()["hash"], first["hash"]);
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_len(32 * 1024 * 1024 + 1)
        .unwrap();
    assert!(refresh(&path).is_err());
    // Bypass the initial metadata guard, as when the file grows after it.
    assert!(bounded_proof(&path, fs::File::open(&path).unwrap()).is_err());
    assert!(refresh(directory.path()).is_err());
}

/// Verifies that [`refresh`] rejects a symlinked control file even when its target is a regular file.
#[cfg(unix)]
#[test]
fn a_control_symlink_cannot_replace_a_regular_preimage() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("outside.json");
    let path = directory.path().join("component.json");
    fs::write(&target, "{}").unwrap();
    std::os::unix::fs::symlink(&target, &path).unwrap();
    assert!(refresh(&path).is_err());
}

/// Verifies that an empty control file hashes identically to [`bit_install::policy::scope::read_proof`].
/// Ensures zero-byte control files produce a non-null SHA-256 preimage digest.
#[test]
fn empty_control_file_hashes_consistently_with_scope_read_proof() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("empty.json");
    fs::write(&path, b"").unwrap();
    let proof = refresh(&path).unwrap();
    assert!(proof["hash"].is_string());
    assert_eq!(proof, bit_install::policy::scope::read_proof(&path).unwrap());
}
