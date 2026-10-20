use super::{Engine, other_id};
use serde_json::json;

#[test]
fn added_versioned_other_aspect_uses_versioned_workspace_identity() {
    let identity = "scope/env/install-compat";
    let versioned = format!("{identity}@0.0.1");
    let input = json!({
        "current":[],"base":[],"other":[],"otherLaneIds":[],"coreNames":[],
        "workspaceIds":[{"base":identity,"legacy":versioned,"version":"0.0.1"}]
    });
    let entry = json!({"componentId":{"base":identity,"legacy":versioned,
        "version":"0.0.1"},"stringId":versioned,"idWithoutVersion":identity});
    let engine = Engine::new(&input).unwrap();
    assert_eq!(other_id(&engine, &entry, &versioned).unwrap(), Some(versioned));
}
