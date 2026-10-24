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
