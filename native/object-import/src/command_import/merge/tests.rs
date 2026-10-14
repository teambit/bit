use super::{json, model_from};
#[test]
fn omitted_schema_with_head_matches_canonical_harmony_parse_default() {
    let raw = json!({"name":"component","scope":"scope","versions":{},"lang":"javascript","deprecated":false,"bindingPrefix":"@bit","remotes":[],"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"});
    let normalized = model_from(None, &raw, true).unwrap();
    assert_eq!(normalized["schema"], "1.0.0");
    assert!(raw.get("schema").is_none());
    assert_eq!(
        serde_json::to_string(&model_from(Some(&normalized), &raw, true).unwrap()).unwrap(),
        serde_json::to_string(&normalized).unwrap(),
    );
    let mut legacy = raw;
    legacy
        .as_object_mut()
        .unwrap()
        .remove("head");
    assert!(model_from(None, &legacy, true).is_err());
}

#[test]
fn a_cached_model_orphans_new_tags_and_keeps_the_head() {
    let head = "a".repeat(40);
    let cached = "b".repeat(40);
    let existing = serde_json::json!({"name":"x","scope":"other","versions":{"1.0.0":head},"lang":"javascript","deprecated":false,"bindingPrefix":"@other","remotes":[],"schema":"1.0.0","head":head});
    let incoming = serde_json::json!({"name":"x","scope":"other","versions":{"1.0.0":head,"1.0.1":cached},"lang":"javascript","deprecated":false,"bindingPrefix":"@other","remotes":[],"schema":"1.0.0","head":cached});
    let merged = model_from(Some(&existing), &incoming, false).unwrap();
    assert_eq!(merged["head"], serde_json::json!(head));
    assert_eq!(merged["versions"], serde_json::json!({"1.0.0":head}));
    assert_eq!(merged["orphanedVersions"], serde_json::json!({"1.0.1":cached}));
}
