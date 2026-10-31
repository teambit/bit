use super::{project, validate};
use serde_json::json;

#[test]
fn harmony_projection_normalizes_old_ids_without_mutating_stored_objects() {
    let stored = json!({"schema":"1.0.0", "dependencies":[{"id":{"scope":"scope","name":"dep","version":"1.0.0"},"relativePaths":[]}],
        "flattenedDependencies":["scope/dep@1.0.0"], "flattenedDevDependencies":[{"scope":"scope","name":"dev","version":"2.0.0"}]});
    let before = stored.clone();
    let normalized = project(&stored).unwrap();
    assert_eq!(stored, before);
    assert_eq!(normalized["schema"], "1.0.0");
    assert_eq!(
        normalized["flattenedDependencies"],
        json!([
            {"scope":"scope","name":"dep","version":"1.0.0"},
            {"scope":"scope","name":"dev","version":"2.0.0"},
        ]),
    );
    assert!(normalized.get("flattenedDevDependencies").is_none());
    assert_eq!(normalized["packageJsonChangedProps"], json!({}));
    assert_eq!(normalized["devDependencies"], json!([]));
    assert_eq!(normalized["docs"], json!([]));
}

#[test]
fn legacy_and_historical_unscoped_aliases_do_not_enter_harmony_projection() {
    for schema in [json!("0.0.0"), json!("3.0.0"), json!(null)] {
        assert!(validate(&json!({"schema":schema})).is_err());
    }
    assert!(project(&json!({"schema":"1.0.0","dependencies":[{"id":{"name":"dep"}}]})).is_err());
    assert!(project(&json!({"schema":"1.0.0","flattenedDependencies":["dep@1.0.0"]})).is_err());
    for schema in ["1.0.0", "2.0.0"] {
        assert!(validate(&json!({"schema":schema})).is_ok());
    }
}

#[test]
fn status_semantic_hash_is_independent_of_harmony_schema_and_storage_defaults() {
    let old = json!({"schema":"1.0.0","mainFile":"index.js","files":[{"relativePath":"index.js","file":"a".repeat(40),"name":"index.js","test":false}],
        "log":{"date":"1","message":"initial"},"dependencies":[{"id":{"scope":"scope","name":"dep","version":"1.0.0"},"relativePaths":[]}]});
    let mut current = project(&old).unwrap();
    current["schema"] = json!("2.0.0");
    assert_eq!(
        super::super::semantic::hash(&old).unwrap(),
        super::super::semantic::hash(&current).unwrap(),
    );
    current["dependencies"][0]["id"]["version"] = json!("2.0.0");
    assert_ne!(
        super::super::semantic::hash(&old).unwrap(),
        super::super::semantic::hash(&current).unwrap(),
    );
}

#[test]
fn flattened_id_representation_is_uniform_within_each_historical_field() {
    let object = json!({"scope":"scope","name":"dep","version":"1.0.0"});
    for rows in [json!(["scope/dep@1.0.0", object]), json!([object, "scope/dep@1.0.0"])] {
        assert!(validate(&json!({"schema":"1.0.0","flattenedDependencies":rows})).is_err());
        assert!(project(&json!({"schema":"1.0.0","flattenedDependencies":rows})).is_err());
        assert!(project(&json!({"schema":"1.0.0","flattenedDevDependencies":rows})).is_err());
    }
}

#[test]
fn validate_accepts_scoped_string_dependency_ids_and_rejects_unscoped() {
    let valid = json!({
        "schema": "2.0.0",
        "dependencies": [{"id": "scope/dep@1.0.0", "relativePaths": []}],
        "devDependencies": [{"id": {"scope": "scope", "name": "dev", "version": "2.0.0"}, "relativePaths": []}],
    });
    assert!(validate(&valid).is_ok());
    let unscoped = json!({
        "schema": "2.0.0",
        "dependencies": [{"id": "dep@1.0.0", "relativePaths": []}],
    });
    assert!(validate(&unscoped).is_err());
}
