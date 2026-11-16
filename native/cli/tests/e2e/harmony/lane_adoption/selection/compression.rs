//! Valid model wire encodings must not bypass released mutable-object canonicalization ([`main_switch_canonicalizes_an_unchanged_main_only_component_zlib_stream`]).
//!
//! Verifies that `bit switch main` re-encodes level-0 `zlib` component streams to default compression.

use crate::{
    commands::move_paths::support,
    helper::{Helper, remote},
};
use flate2::{Compression, read::ZlibDecoder, write::ZlibEncoder};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

/// Verifies that `bit switch main` re-compresses level-0 zlib component objects using default compression.
#[test]
fn main_switch_canonicalizes_an_unchanged_main_only_component_zlib_stream() {
    let helper = support::workspace(2, true);
    remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    support::setup(&helper, "snap comp1 --unmodified --ignore-issues * --message lane");
    remote::publish(&helper);
    let hash = model_hash(&helper);
    let local = bit_object_import::scope_path(&helper.scopes.local_path);
    let path = object(&local, &hash);
    let before = stored_stream(&path);
    stored_stream(&object(&helper.scopes.remote_path, &hash));
    let result = super::two_write_success(&helper, "switch main -x");
    assert!(result.stdout.contains("1 skipped component(s)"), "{}", result.stdout);
    let after = fs::read(&path).unwrap();
    assert_ne!(after[1], 0x01, "released default compression replaces the stored stream");
    assert_eq!(inflate(&after), before);
}

/// Looks up the object hash of `comp2` in the local scope's `index.json`.
fn model_hash(helper: &Helper) -> String {
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let index: serde_json::Value =
        serde_json::from_slice(&fs::read(scope.join("index.json")).unwrap()).unwrap();
    index["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"]["name"] == "comp2")
        .unwrap()["hash"]
        .as_str()
        .unwrap()
        .to_owned()
}

/// Resolves the loose object file path under `scope/objects` for `hash`.
fn object(scope: &Path, hash: &str) -> PathBuf {
    scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..])
}

/// Rewrites `path` as a level-0 `zlib` stream and returns the uncompressed raw object bytes ([`inflate`]).
fn stored_stream(path: &Path) -> Vec<u8> {
    let original = fs::read(path).unwrap();
    let raw = inflate(&original);
    assert!(raw.starts_with(b"Component "));
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::none());
    encoder.write_all(&raw).unwrap();
    let changed = encoder.finish().unwrap();
    assert_eq!(changed[1], 0x01, "actual zlib level0 header");
    assert_ne!(changed, original, "fixture must introduce noncanonical compression");
    assert_eq!(inflate(&changed), raw, "header and body bytes must remain exact");
    fs::write(path, changed).unwrap();
    raw
}

/// Decompresses a `zlib`-encoded object slice via [`ZlibDecoder`] for [`stored_stream`], [`model_hash`], [`object`], and [`main_switch_canonicalizes_an_unchanged_main_only_component_zlib_stream`].
fn inflate(bytes: &[u8]) -> Vec<u8> {
    let mut raw = Vec::new();
    ZlibDecoder::new(bytes).read_to_end(&mut raw).unwrap();
    raw
}
