//! Unit tests for [`Engine`] and [`other_id`] versioned workspace aspect
//! identity resolution during config merge in `bit-object-import` merge planning ([`added_versioned_other_aspect_uses_versioned_workspace_identity`]) across `workspaceIds` entries.

use super::{Engine, other_id};
use serde_json::json;

/// Verifies that [`other_id`] resolves an added versioned aspect (`scope/env/install-compat`) in [`Engine`] ([`Engine::new`]) to its versioned `workspaceIds` identity (`scope/env/install-compat@0.0.1`).
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
