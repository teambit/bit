use super::{Fixture, State, apply};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{fs, io};
fn request(fixture: &Fixture, base: &Value, target: &Value, raw: &[u8]) -> Value {
    let current = fixture.0.join("index.ts");
    fs::write(&current, raw).unwrap();
    let raw_hash = crate::validate::hexadecimal(&Sha1::digest(raw));
    let snapshot = raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(raw);
    let snapshot_hash = crate::validate::hexadecimal(&Sha1::digest(snapshot));
    json!({"index":0,"objectsDirectory":fixture.0.join("objects"),
        "snapshotDirectory":fixture.0.join("snapshots"),"base":base,"target":target,
        "labels":{"current":"current","other":"other"},
        "current":[{"relativePath":"index.ts","workspace":{"path":current,"rawHash":raw_hash,"snapshotHash":snapshot_hash}}]})
}
fn prepare(mut request: Value) -> io::Result<Value> {
    let mut state = State::default();
    let owner = apply("mergeTransactionBegin", json!({"mode":"status","count":1}), &mut state)?;
    request["token"] = owner["token"].clone();
    apply("mergePrepare", request, &mut state)
}
fn remove_source(fixture: &Fixture, version: &Value) {
    let hash = version["files"][0]["hash"].as_str().unwrap();
    fs::remove_file(
        fixture.0
            .join("objects")
            .join(&hash[..2])
            .join(&hash[2..]),
    )
    .unwrap();
}
#[test]
fn unused_base_body_is_not_read_for_equal_current_or_equal_target() {
    for current in [b"base\n".as_slice(), b"target\n", b"\xef\xbb\xbfbase\r\n"] {
        let fixture = Fixture::new();
        let base = fixture.version('4', b"base\n");
        let target = fixture.version('5', b"target\n");
        let request = request(&fixture, &base, &target, current);
        remove_source(&fixture, &base);
        let result = prepare(request).unwrap();
        assert_eq!(result["reads"]["sourceReads"], 1);
        let kind = if current == b"target\n" { "unModifiedFiles" } else { "updatedFiles" };
        assert_eq!(result["mergeRows"][0]["kind"], kind);
        assert_eq!(fs::read(fixture.0.join("index.ts")).unwrap(), current);
    }
}
#[test]
fn required_base_body_is_verified_and_failure_writes_no_snapshots() {
    for corrupt in [false, true] {
        let fixture = Fixture::new();
        let base = fixture.version('4', b"base\n");
        let target = fixture.version('5', b"target\n");
        let request = request(&fixture, &base, &target, b"current\n");
        if corrupt {
            fixture.object(base["files"][0]["hash"].as_str().unwrap(), "Source", b"wrong identity");
        } else {
            remove_source(&fixture, &base);
        }
        assert!(prepare(request).is_err());
        assert_eq!(fs::read_dir(fixture.0.join("snapshots")).unwrap().count(), 0);
        assert_eq!(fs::read(fixture.0.join("index.ts")).unwrap(), b"current\n");
    }
}
#[test]
fn unused_base_still_requires_complete_manifest_verification() {
    let fixture = Fixture::new();
    let base = fixture.version('4', b"base\n");
    let target = fixture.version('5', b"target\n");
    let request = request(&fixture, &base, &target, b"base\n");
    fixture.object(&"4".repeat(40), "Version", b"{\"files\":[]}");
    assert!(prepare(request).is_err());
    assert_eq!(fs::read_dir(fixture.0.join("snapshots")).unwrap().count(), 0);
}
#[test]
fn modified_rows_keep_base_source_receipts() {
    let fixture = Fixture::new();
    let base = fixture.version('4', b"base\n");
    let target = fixture.version('5', b"target\n");
    let result = prepare(request(&fixture, &base, &target, b"current\n")).unwrap();
    assert_eq!(result["reads"]["sourceReads"], 2);
    assert_eq!(result["mergeRows"][0]["kind"], "modifiedFiles");
    assert!(
        result["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|source| source["hash"] == base["files"][0]["hash"]),
    );
}
