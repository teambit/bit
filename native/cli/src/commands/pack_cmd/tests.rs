//! Unit tests for `bit pack` [`Options`] CLI parsing ([`parse_options`]), missing scope checks ([`is_missing_scope`]), and `.tgz` tarball generation ([`build_tgz_bytes`]).
//!
//! Verifies `--out-dir`, `--override`, `--keep`, and `--prefix` flags and gzipped tar entries.

use super::{Options, is_missing_scope, packer::build_tgz_bytes, parse_options};
use flate2::read::GzDecoder;
use serde_json::json;
use std::io::Read;

#[test]
fn parses_pack_options_and_detects_missing_scope() {
    assert_eq!(parse_options(&[]), None);
    let opts = parse_options(&["comp1", "-d", "out", "-o", "-k", "-p", "-j"]).unwrap();
    assert_eq!(
        opts,
        Options {
            comp_id: "comp1".into(),
            scope_path: None,
            out_dir: Some("out".into()),
            override_existing: true,
            keep: true,
            prefix: true,
            json: true,
        },
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(is_missing_scope(temp.path(), &opts));
}

#[test]
fn builds_valid_tgz_archive() {
    let pkg = json!({
        "name": "@my-scope/comp1",
        "version": "0.0.1",
        "main": "index.js",
    });
    let files = vec![("index.js".to_owned(), b"module.exports = 42;\n".to_vec())];
    let tgz = build_tgz_bytes(&pkg, &files).unwrap();
    let mut gz = GzDecoder::new(tgz.as_slice());
    let mut tar_bytes = Vec::new();
    gz.read_to_end(&mut tar_bytes).unwrap();
    let mut archive = tar::Archive::new(tar_bytes.as_slice());
    let paths: Vec<String> = archive
        .entries()
        .unwrap()
        .map(|entry| {
            entry
                .unwrap()
                .path()
                .unwrap()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    assert!(paths.contains(&"package/package.json".to_owned()));
    assert!(paths.contains(&"package/index.js".to_owned()));
}

#[test]
fn parses_optional_scope_path_and_rejects_third_positional_argument() {
    let with_scope = parse_options(&["comp1", "my-scope-dir"]).unwrap();
    assert_eq!(with_scope.scope_path.as_deref(), Some("my-scope-dir"));
    assert_eq!(parse_options(&["comp1", "comp2", "comp3"]), None);
    assert_eq!(parse_options(&["comp1", "--unknown"]), None);
}
