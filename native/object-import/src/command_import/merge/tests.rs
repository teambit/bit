use super::{json, model};
#[test]
fn omitted_schema_with_head_matches_canonical_harmony_parse_default() {
    let raw = json!({"name":"component","scope":"scope","versions":{},"lang":"javascript","deprecated":false,"bindingPrefix":"@bit","remotes":[],"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"});
    let normalized = model(None, &raw).unwrap();
    assert_eq!(normalized["schema"], "1.0.0");
    assert!(raw.get("schema").is_none());
    assert_eq!(
        serde_json::to_string(&model(Some(&normalized), &raw).unwrap()).unwrap(),
        serde_json::to_string(&normalized).unwrap(),
    );
    let mut legacy = raw;
    legacy
        .as_object_mut()
        .unwrap()
        .remove("head");
    assert!(model(None, &legacy).is_err());
}
