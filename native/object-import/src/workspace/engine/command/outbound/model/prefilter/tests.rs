use super::{HistoryBytes, Prepared};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static SEQUENCE: AtomicUsize = AtomicUsize::new(0);

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

#[test]
fn absent_history_preimage_rejects_concurrent_history_creation() {
    let scratch = Scratch::new();
    let path = scratch.0.join(".bit/objects/existing-history");
    let mut prepared = Prepared { root: scratch.0.clone(), ..Prepared::default() };
    prepared.capture(path.clone()).unwrap();
    fs::write(path, b"another-owner-history").unwrap();
    assert!(prepared.stage().is_err());
}
