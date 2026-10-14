use super::{Kind, Versions, pattern_ids, validate_preparation};
use serde_json::json;

#[test]
fn patterns_select_the_matching_targets() {
    let context = json!({ "targets": [{ "identity": "s/one" }, { "identity": "s/two" }, { "identity": "t/one" }] });
    assert_eq!(pattern_ids(&context, None).unwrap(), None);
    assert_eq!(pattern_ids(&context, Some("s/two")).unwrap(), Some(vec!["s/two".to_string()]));
    assert_eq!(
        pattern_ids(&context, Some("s/*")).unwrap(),
        Some(vec!["s/one".to_string(), "s/two".to_string()]),
    );
    assert_eq!(
        pattern_ids(&context, Some("**, !s/one")).unwrap(),
        Some(vec!["s/two".to_string(), "t/one".to_string()]),
    );
    for pattern in ["s/three", "$modified", "s/{one,two}"] {
        assert!(pattern_ids(&context, Some(pattern)).is_err(), "{pattern}");
    }
}

#[test]
fn versions_are_collected_from_nested_versions_and_identities() {
    let mut versions = Versions::default();
    versions.visit(&json!([{ "version": "1.0.0", "deps": [{ "identity": "s/a@2.0.0" }, { "version": "1.0.0" }] }]));
    assert_eq!(versions.list, ["1.0.0", "2.0.0"]);
}

#[test]
fn preparations_must_select_known_targets() {
    let targets = json!([{ "identity": "s/a" }]);
    let ok = json!({ "token": "t", "context": { "targets": targets }, "targets": targets, "selectedIds": ["s/a"] });
    assert!(validate_preparation(&ok, Kind::Snap).is_ok());
    let unknown = json!({ "token": "t", "context": { "targets": targets }, "targets": targets, "selectedIds": ["s/b"] });
    assert!(validate_preparation(&unknown, Kind::Snap).is_err());
    let different = json!({ "token": "t", "context": { "targets": [] }, "targets": targets, "selectedIds": [] });
    assert!(validate_preparation(&different, Kind::Snap).is_err());
}

#[test]
fn a_resolve_needs_components_in_merge_state() {
    let targets = json!([{ "identity": "s/a" }]);
    let none = json!({ "token": "t", "context": { "targets": targets }, "targets": targets, "selectedIds": [] });
    assert!(validate_preparation(&none, Kind::Snap).is_ok());
    assert!(validate_preparation(&none, Kind::Resolve).is_err());
}
