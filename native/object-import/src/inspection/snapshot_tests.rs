use super::{State, apply, begin, tests::Fixture};
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
    apply("inspectionFinish", json!({"token":token}), &mut state).unwrap();
}
