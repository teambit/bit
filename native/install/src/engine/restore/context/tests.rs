use super::{graph, merge};
use serde_json::{Value, json};

#[test]
fn legacy_checksums_become_overrides_only_without_explicit_overrides() {
    let legacy =
        graph(&json!({"pnpmfileChecksum":"bit-1","lockfileSettings":{"autoInstallPeers":true}}));
    assert_eq!(legacy["settings"], json!({"autoInstallPeers":true}));
    assert!(legacy.get("pnpmfileChecksum").is_none());
    assert_eq!(legacy["overrides"], json!({"@teambit/legacy@*":"-","@teambit/harmony@*":"-"}));
    for overrides in [json!({}), json!({"sample-package":"1.0.0"})] {
        let explicit = graph(&json!({"pnpmfileChecksum":"bit-1","overrides":overrides}));
        assert_eq!(explicit["pnpmfileChecksum"], "bit-1");
        assert_eq!(explicit["overrides"], overrides);
    }
}

#[test]
fn link_only_sides_do_not_invalidate_the_other_sides_resolution_settings() {
    for existing_resolutions in [false, true] {
        for graph_resolutions in [false, true] {
            let existing = side(existing_resolutions, "old");
            let graph = side(graph_resolutions, "new");
            let mut merged = existing.as_object().unwrap().clone();
            merge(existing.as_object().unwrap(), graph.as_object().unwrap(), &mut merged);
            let expected = if !existing_resolutions {
                Some("new")
            } else if !graph_resolutions {
                Some("old")
            } else {
                None
            };
            assert_eq!(merged.get("pnpmfileChecksum").and_then(Value::as_str), expected);
            assert_eq!(merged.get("overrides").is_some(), expected.is_some());
            assert_eq!(merged.get("settings").is_some(), expected.is_some());
        }
    }
}

fn side(resolutions: bool, value: &str) -> Value {
    json!({"packages":if resolutions {json!({"sample-package@1.0.0":{}})} else {json!({})},
        "pnpmfileChecksum":value,"overrides":{"sample-package":value},"settings":{"resolutionMode":value}})
}
