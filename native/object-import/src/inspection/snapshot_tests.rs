use super::{MAX_BYTES, State, apply, begin, tests::Fixture};
use serde_json::{Value, json};
use std::fs;

fn request(fixture: &Fixture) -> Value {
    json!({"ownedMemory":true,"files":[{"relativePath":"file","path":fixture.0.join("file")}],
        "workspaceRoot":false,"snapshotDirectory":fixture.directory("snapshots")})
}

#[test]
fn owned_capture_requires_embedded_capability_and_never_spools() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("file"), b"\xef\xbb\xbforiginal\r\n").unwrap();
    let mut input = request(&fixture);
    input
        .as_object_mut()
        .unwrap()
        .remove("snapshotDirectory");
    let mut state = State::default();
    assert!(begin(&input, &mut state, None).is_err());
    state.enable_memory_snapshots();
    let result = begin(&input, &mut state, None).unwrap();
    assert_eq!(result["spooledFiles"], 0);
    assert!(result["files"][0].get("snapshotPath").is_none());
    assert_eq!(fs::read_dir(fixture.0.join("snapshots")).unwrap().count(), 0);
    let token = result["token"].as_str().unwrap();
    let snapshot = state.snapshot(token).unwrap();
    fs::remove_file(fixture.0.join("file")).unwrap();
    apply("inspectionFinish", json!({"token":token}), &mut state).unwrap();
    assert!(state.snapshot(token).is_err());
    drop(state);
    let mut escaped = snapshot.read(0).unwrap();
    escaped.fill(0);
    assert_eq!(snapshot.read(0).unwrap(), b"original\r\n");
    assert!(snapshot.read(1).is_err());
}

#[test]
fn escaped_snapshot_keeps_byte_budget_until_last_handle_is_dropped() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("file"), vec![b'a'; MAX_BYTES]).unwrap();
    let input = request(&fixture);
    let mut state = State::default();
    state.enable_memory_snapshots();
    let result = begin(&input, &mut state, None).unwrap();
    let token = result["token"].as_str().unwrap();
    let first = state.snapshot(token).unwrap();
    let second = state.snapshot(token).unwrap();
    apply("inspectionFinish", json!({"token":token}), &mut state).unwrap();
    fs::write(fixture.0.join("file"), b"next").unwrap();
    assert!(begin(&input, &mut state, None).is_err());
    drop(first);
    assert!(begin(&input, &mut state, None).is_err());
    drop(second);
    assert!(begin(&input, &mut state, None).is_ok());
}
