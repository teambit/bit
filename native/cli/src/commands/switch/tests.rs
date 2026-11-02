//! Unit tests for extracting materialized writer component IDs ([`writer_ids`]) after `bit switch` execution.
//!
//! Verifies `switchWriterIds` extraction and rejection of missing or non-array fields.

use super::writer_ids;
use serde_json::json;

#[test]
fn installation_uses_only_materialized_writers_even_when_report_lists_components() {
    let all_ours = json!({
        "result": {"components":[{"id":"s/a@abc"}],"addedComponents":["s/b@def"]},
        "switchWriterIds": [],
    });
    assert!(writer_ids(&all_ours).unwrap().is_empty());
    let materialized = json!({
        "result": {"components":[{"id":"s/a@abc"},{"id":"s/b@def"}]},
        "switchWriterIds": ["s/b@def","s/c@ghi"],
    });
    assert_eq!(writer_ids(&materialized).unwrap(), ["s/b@def", "s/c@ghi"]);
    assert!(writer_ids(&json!({"result": {"components": []}})).is_err());
    assert!(writer_ids(&json!({"switchWriterIds": [null]})).is_err());
}

#[test]
fn non_array_switch_writer_ids_is_rejected() {
    assert!(writer_ids(&json!({"switchWriterIds": "s/a@abc"})).is_err());
}
