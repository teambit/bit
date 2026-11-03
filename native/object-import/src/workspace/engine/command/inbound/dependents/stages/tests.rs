//! Unit tests for inbound dependent stage [`current_dependencies`] extraction ([`resolved_class_dependencies_override_empty_legacy_metadata_and_explicit_empty_is_authoritative`]) in `bit-object-import`.
//!
//! Confirms that `resolvedDependencies` override legacy dependency arrays when present and reject non-array shapes.

use super::current_dependencies;
use serde_json::json;

/// Verifies that [`current_dependencies`] prefers `resolvedDependencies` over legacy `dependencies`/`devDependencies` (`DependenciesData`) arrays and rejects non-array `resolvedDependencies`.
#[test]
fn resolved_class_dependencies_override_empty_legacy_metadata_and_explicit_empty_is_authoritative()
{
    let mut row = json!({"current":{"dependencies":[],"devDependencies":[]},
        "resolvedDependencies":[{"componentId":{"scope":"scope","name":"actual","version":"1.2.3"},"lifecycle":"runtime"}]});
    let actual = current_dependencies(&row).unwrap();
    assert_eq!(actual.len(), 1);
    assert_eq!(actual[0].name, "actual");
    assert_eq!(actual[0].version, "1.2.3");
    row["current"]["dependencies"] =
        json!([{"id":{"scope":"scope","name":"legacy","version":"9.0.0"}}]);
    row["resolvedDependencies"] = json!([]);
    assert!(current_dependencies(&row).unwrap().is_empty());
    row["resolvedDependencies"] = json!({});
    assert!(current_dependencies(&row).is_err());
}
