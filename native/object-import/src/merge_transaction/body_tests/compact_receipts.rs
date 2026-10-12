use super::{Fixture, State, apply};
use serde_json::json;

#[test]
fn compact_apply_returns_only_new_bodies_and_rejects_stale_prefixes() {
    let fixture = Fixture::new();
    let mut state = State::default();
    let incoming = fixture.version('1', b"incoming\n");
    let prepared = fixture.prepare_packed(&mut state, &incoming, true);
    let target = fixture.version('2', b"different template\n");
    let mut request = json!({"token":prepared["ownerToken"],"planToken":prepared["token"],"target":target,"strategy":"theirs","knownBodies":1});
    let compact = apply("mergeApply", request.clone(), &mut state).unwrap();
    assert_eq!(compact["knownBodies"], 1);
    assert_eq!(compact["bodyCount"], 2);
    assert_eq!(
        compact["bodies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(compact["bodies"][0]["planIndex"], 1);
    assert!(compact.get("targetFiles").is_none());
    assert!(apply("mergeApply", request.clone(), &mut state).is_err());
    request
        .as_object_mut()
        .unwrap()
        .remove("knownBodies");
    let legacy = apply("mergeApply", request.clone(), &mut state).unwrap();
    assert_eq!(legacy["bodies"][0], prepared["bodies"][0]);
    assert_eq!(legacy["bodies"][1], compact["bodies"][0]);
    assert_eq!(legacy["files"], compact["files"]);
    assert_eq!(legacy["filesStatus"], compact["filesStatus"]);
    request["knownBodies"] = json!(2);
    let reused = apply("mergeApply", request.clone(), &mut state).unwrap();
    assert_eq!(reused["bodies"], json!([]));
    assert_eq!(reused["bodyCount"], 2);
    fixture.object(&"2".repeat(40), "Version", b"{\"files\":[]}");
    assert!(apply("mergeApply", request, &mut state).is_err());
}
