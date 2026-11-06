//! Unit tests for outbound [`Prepared`] and [`HistoryBytes`] export prefilter stale discovery rejection in `bit-object-import`.
//!
//! Confirms that concurrent object store modifications between prefilter and preparation in [`Scratch`] workspaces ([`SEQUENCE`], [`stale_discovery_prevents_history_publication_even_without_transfer_batches`]) are rejected.

use super::{HistoryBytes, Prepared};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

/// Monotonic counter used by [`Scratch`] to create isolated temporary export prefilter directories.
static SEQUENCE: AtomicUsize = AtomicUsize::new(0);

/// Temporary workspace directory fixture that removes its root on drop.
#[derive(Debug)]
struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-export-prefilter-{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(path.join(".bit/objects")).unwrap();
        Self(path)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

/// Verifies that [`Prepared::stage`] rejects stale control or object preimages before publishing [`HistoryBytes`].
#[test]
fn stale_discovery_prevents_history_publication_even_without_transfer_batches() {
    for relative in [
        ".bitmap",
        ".bit/scope.json",
        ".bit/index.json",
        ".bit/objects/model",
        ".bit/objects/history",
    ] {
        let scratch = Scratch::new();
        let path = scratch.0.join(relative);
        fs::write(&path, b"original").unwrap();
        let mut prepared = Prepared {
            root: scratch.0.clone(),
            histories: vec![HistoryBytes {
                hash: "a".repeat(40),
                bytes: b"new-history".to_vec(),
                hashes: Vec::new(),
            }],
            ..Prepared::default()
        };
        prepared.capture(path.clone()).unwrap();
        fs::write(&path, b"concurrent-change").unwrap();
        assert!(prepared.stage().is_err(), "{relative}");
        assert!(!scratch.0.join(".bit/objects/aa").exists(), "{relative}");
        assert_eq!(fs::read(path).unwrap(), b"concurrent-change");
    }
}

/// Verifies that [`Prepared::stage`] in [`Scratch`] rejects concurrent creation of a history object that was absent when [`Prepared::capture`] ran ([`stale_discovery_prevents_history_publication_even_without_transfer_batches`]).
#[test]
fn absent_history_preimage_rejects_concurrent_history_creation() {
    let scratch = Scratch::new();
    let path = scratch.0.join(".bit/objects/existing-history");
    let mut prepared = Prepared { root: scratch.0.clone(), ..Prepared::default() };
    prepared.capture(path.clone()).unwrap();
    fs::write(path, b"another-owner-history").unwrap();
    assert!(prepared.stage().is_err());
}
