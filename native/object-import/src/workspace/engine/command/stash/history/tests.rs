//! Unit tests for verifying published `VersionHistory` payloads via [`verify_published`] during stash.
//!
//! Checks that replaced or corrupted zlib payloads fail published history verification.

use super::verify_published;
use crate::read_budget::Budget;
use flate2::{Compression, write::ZlibEncoder};
use std::io::Write;

#[test]
fn replaced_history_cannot_become_an_accepted_published_proof() {
    let expected = b"VersionHistory abc 2\0{}";
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(expected).unwrap();
    let packed = encoder.finish().unwrap();
    verify_published(expected, &packed, &Budget::new(1024)).unwrap();
    let error =
        verify_published(b"VersionHistory abc 2\0[]", &packed, &Budget::new(1024)).unwrap_err();
    assert!(error.to_string().contains("changed after publication"));
}

#[test]
fn corrupted_zlib_payload_fails_published_history_verification() {
    let expected = b"VersionHistory abc 2\0{}";
    assert!(verify_published(expected, b"not-valid-zlib", &Budget::new(1024)).is_err());
}
