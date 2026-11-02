//! Unit tests for reading version and source objects ([`body`], [`MAX_BYTES`], [`compressed`], [`fixture`]) through an import [`Overlay`]
//! in `bit-object-import` checkout transitions.

use super::{MAX_BYTES, Overlay, body, wire};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::json;
use sha1::{Digest, Sha1};
use std::{io::Write, path::Path};

/// Compresses `bytes` with a `<kind> <hash> <len>\0` Bit object header using default zlib compression.
fn compressed(kind: &str, hash: &str, bytes: &[u8]) -> Vec<u8> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0", bytes.len()).unwrap();
    encoder.write_all(bytes).unwrap();
    encoder.finish().unwrap()
}

/// Builds an [`Overlay`] and [`wire::Version`] manifest containing a compressed `Source` and `Version` object.
fn fixture() -> (Overlay, wire::Version) {
    let bytes = b"imported source\n";
    let hash = crate::validate::hexadecimal(&Sha1::digest(bytes));
    let version_hash = "a".repeat(40);
    let version = json!({"files":[{"relativePath":"index.js","file":hash}]});
    let overlay = crate::command_import::tests::test_overlay(vec![
        (hash.clone(), "Source".into(), compressed("Source", &hash, bytes), None),
        (
            version_hash.clone(),
            "Version".into(),
            compressed("Version", &version_hash, &serde_json::to_vec(&version).unwrap()),
            Some(version),
        ),
    ]);
    let manifest = serde_json::from_value(
        json!({"hash":version_hash,"files":[{"relativePath":"index.js","hash":hash}]}),
    )
    .unwrap();
    (overlay, manifest)
}

/// Verifies that [`super::super::load_with_overlay`] reads `Version` and `Source` objects from an [`Overlay`] without local disk objects.
#[test]
fn imported_version_and_sources_need_no_published_local_objects() {
    let (overlay, version) = fixture();
    let mut raw = 0;
    let mut packed = 0;
    let result = super::super::load_with_overlay(
        Path::new("/nonexistent-checkout-objects"),
        &version,
        &mut raw,
        &mut packed,
        Some(&overlay),
    )
    .unwrap();
    assert_eq!(result, vec![b"imported source\n".to_vec()]);
    assert_eq!(raw, result[0].len());
    assert!(packed > 0);
}

/// Verifies that manifest mismatches and [`MAX_BYTES`] aggregate limits decline in [`body`] and `load_with_overlay`.
#[test]
fn imported_manifest_mismatch_and_aggregate_limits_decline() {
    let (overlay, mut version) = fixture();
    version.files[0].relative_path = "different.js".into();
    assert!(
        super::super::load_with_overlay(
            Path::new("/unused"),
            &version,
            &mut 0,
            &mut 0,
            Some(&overlay)
        )
        .is_err(),
    );
    let hash = &version.files[0].hash;
    let mut raw_limit = MAX_BYTES;
    assert!(body(Path::new("/unused"), hash, &mut raw_limit, &mut 0, Some(&overlay)).is_err());
    let mut compressed_limit = MAX_BYTES;
    assert!(
        body(Path::new("/unused"), hash, &mut 0, &mut compressed_limit, Some(&overlay)).is_err(),
    );
}

/// Verifies that filtered `files` manifests retain complete `Version` proof validation via `proof_files`.
#[test]
fn filtered_manifest_retains_complete_version_proof() {
    let (overlay, mut version) = fixture();
    version.proof_files = Some(version.files.clone());
    version.files.clear();
    let loaded = super::super::load_with_overlay(
        Path::new("/unused"),
        &version,
        &mut 0,
        &mut 0,
        Some(&overlay),
    )
    .unwrap();
    assert!(loaded.is_empty());
    version.files = version.proof_files.clone().unwrap();
    version.files[0].relative_path = "tampered.js".into();
    assert!(
        super::super::load_with_overlay(
            Path::new("/unused"),
            &version,
            &mut 0,
            &mut 0,
            Some(&overlay),
        )
        .is_err(),
    );
}
