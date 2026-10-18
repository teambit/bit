use super::{serialize, set_version};
use serde_json::json;
#[test]
fn scoped_and_default_scope_serialization_match_actual_constructor_order() {
    let raw = json!({"name":"comp00","scope":"fork-benchmark","version":"0.0.1-new"});
    assert_eq!(
        serialize(&raw, true).unwrap().to_string(),
        r#"{"name":"comp00","version":"0.0.1-new","scope":"fork-benchmark"}"#,
    );
    assert_eq!(
        serialize(&raw, false).unwrap().to_string(),
        r#"{"scope":"fork-benchmark","name":"comp00","version":"0.0.1-new"}"#,
    );
}
#[test]
fn resolved_versions_precede_appended_default_scope_without_changing_scoped_order() {
    let raw = json!({"name":"comp00","scope":"fork-benchmark"});
    for (unscoped, expected) in [
        (true, r#"{"name":"comp00","version":"0.0.1-new","scope":"fork-benchmark"}"#),
        (false, r#"{"scope":"fork-benchmark","name":"comp00","version":"0.0.1-new"}"#),
    ] {
        let mut id = serialize(&raw, unscoped).unwrap();
        set_version(id.as_object_mut().unwrap(), "0.0.1-new".into());
        assert_eq!(id.to_string(), expected);
        set_version(id.as_object_mut().unwrap(), "0.0.2".into());
        assert_eq!(id["version"], "0.0.2");
    }
}
