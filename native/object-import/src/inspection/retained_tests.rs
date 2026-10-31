use super::{State, begin, hash, tests::Fixture};
use crate::workspace::snapshots::{Observation, State as Reads};
use serde_json::{Value, json};
use std::{fs, path::Path, sync::Arc};

fn observe(reads: &mut Reads, path: &Path, raw: &[u8]) -> u64 {
    let contents = raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(raw);
    reads
        .retain(Observation {
            path: path.to_path_buf(),
            raw_hash: hash(raw),
            snapshot_hash: hash(contents),
            raw_bytes: raw.len(),
            contents: Arc::from(contents),
        })
        .unwrap()
}
fn request(fixture: &Fixture, token: u64, raw: &[u8]) -> Value {
    json!({"files":[{"relativePath":"file","path":fixture.0.join("file"),
        "rawHash":hash(raw),"snapshotHash":hash(raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(raw)),
        "readToken":token}],"workspaceRoot":false,"snapshotDirectory":fixture.directory("snapshots")})
}

#[test]
fn explicit_read_receipt_keeps_the_original_observation_without_stripping_a_second_bom() {
    let fixture = Fixture::new();
    let raw = b"\xef\xbb\xbf\xef\xbb\xbforiginal\r\n";
    let mut reads = Reads::default();
    let token = observe(&mut reads, &fixture.0.join("file"), raw);
    let input = request(&fixture, token, raw);
    let mut state = State::default();
    let result = begin(&input, &mut state, Some(&reads)).unwrap();
    let row = &result["files"][0];
    assert_eq!(row["rawHash"], hash(raw));
    assert_eq!(row["snapshotHash"], hash(&raw[3..]));
    assert_eq!(fs::read(row["snapshotPath"].as_str().unwrap()).unwrap(), &raw[3..]);
    assert!(!fixture.0.join("file").exists());
}

#[test]
fn changed_receipts_and_other_owners_cannot_publish_a_snapshot() {
    for field in ["readToken", "path", "rawHash", "snapshotHash", "owner"] {
        let fixture = Fixture::new();
        let mut reads = Reads::default();
        let token = observe(&mut reads, &fixture.0.join("file"), b"original");
        let mut input = request(&fixture, token, b"original");
        input["files"][0][field] = match field {
            "readToken" => json!(token + 1),
            "path" => json!(fixture.0.join("other")),
            "owner" => Value::Null,
            _ => json!(hash(b"changed")),
        };
        if field == "owner" {
            input["files"][0]
                .as_object_mut()
                .unwrap()
                .remove("owner");
        }
        let owner = if field == "owner" { None } else { Some(&reads) };
        assert!(begin(&input, &mut State::default(), owner).is_err());
        assert_eq!(fs::read_dir(fixture.0.join("snapshots")).unwrap().count(), 0);
    }
}

#[test]
fn read_without_a_token_observes_disk_instead_of_a_retained_body() {
    let fixture = Fixture::new();
    let path = fixture.0.join("file");
    let mut reads = Reads::default();
    let token = observe(&mut reads, &path, b"original");
    fs::write(&path, b"changed").unwrap();
    let mut input = request(&fixture, token, b"original");
    for field in ["readToken", "rawHash", "snapshotHash"] {
        input["files"][0]
            .as_object_mut()
            .unwrap()
            .remove(field);
    }
    let result = begin(&input, &mut State::default(), Some(&reads)).unwrap();
    assert_eq!(result["files"][0]["rawHash"], hash(b"changed"));
}

#[test]
fn memory_only_capture_validates_supplied_read_ownership() {
    let fixture = Fixture::new();
    let mut reads = Reads::default();
    let token = observe(&mut reads, &fixture.0.join("file"), b"original");
    let mut input = request(&fixture, token, b"original");
    input["memoryOnly"] = json!(true);
    let mut state = State::default();
    let result = begin(&input, &mut state, Some(&reads)).unwrap();
    assert!(result["files"][0].get("snapshotPath").is_none());
    assert_eq!(result["retainedReads"], 1);
    assert_eq!(result["spooledFiles"], 0);
    assert_eq!(fs::read_dir(fixture.0.join("snapshots")).unwrap().count(), 0);
    let result = super::apply(
        "inspectionFiles",
        json!({"token":result["token"],
        "modelFiles":[{"relativePath":"file","hash":hash(b"original")}]}),
        &mut state,
    )
    .unwrap();
    assert_eq!(result["modified"], false);
    input["files"][0]["readToken"] = json!(token + 1);
    assert!(begin(&input, &mut state, Some(&reads)).is_err());
}

#[test]
fn caller_hashes_allow_memory_only_capture_without_a_retained_read() {
    let fixture = Fixture::new();
    let raw = b"\xef\xbb\xbforiginal\r\n";
    fs::write(fixture.0.join("file"), raw).unwrap();
    let mut input = request(&fixture, 1, raw);
    input["files"][0]
        .as_object_mut()
        .unwrap()
        .remove("readToken");
    input["memoryOnly"] = json!(true);
    let mut state = State::default();
    let result = begin(&input, &mut state, None).unwrap();
    assert_eq!(result["retainedReads"], 0);
    assert_eq!(result["spooledFiles"], 0);
    assert!(result["files"][0].get("snapshotPath").is_none());
    for field in ["rawHash", "snapshotHash"] {
        let mut missing = input.clone();
        missing["files"][0]
            .as_object_mut()
            .unwrap()
            .remove(field);
        assert!(begin(&missing, &mut state, None).is_err());
        missing["files"][0][field] = json!(hash(b"different"));
        assert!(begin(&missing, &mut state, None).is_err());
    }
    assert_eq!(fs::read_dir(fixture.0.join("snapshots")).unwrap().count(), 0);
}
