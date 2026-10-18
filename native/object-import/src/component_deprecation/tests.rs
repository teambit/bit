use super::{ASPECT, Value, json, selection, set_config, validate_range};
fn bitmap() -> Value {
    json!({"foo":{"name":"foo","scope":"scope","version":"1.0.0","rootDir":"foo"},"bar":{"name":"bar","defaultScope":"scope","rootDir":"bar"}})
}
#[test]
fn replacement_metadata_retains_scope_name_and_version() {
    let mut bitmap = bitmap();
    set_config(&mut bitmap, "scope/foo", Some("scope/new/name@2.0.0"), None, false).unwrap();
    assert_eq!(
        bitmap["foo"]["config"][ASPECT],
        json!({"deprecate":true,"newId":{"scope":"scope","name":"new/name","version":"2.0.0"}}),
    );
}
#[test]
fn range_and_undeprecation_have_distinct_config_shapes() {
    let mut bitmap = bitmap();
    set_config(&mut bitmap, "scope/foo", None, Some("<2"), false).unwrap();
    assert_eq!(bitmap["foo"]["config"][ASPECT], json!({"deprecate":false,"range":"<2"}));
    set_config(&mut bitmap, "scope/foo", None, None, true).unwrap();
    assert_eq!(bitmap["foo"]["config"][ASPECT], json!({"deprecate":false,"newId":""}));
}
#[test]
fn patterns_include_namespaces_and_exclusions() {
    assert_eq!(selection::select(&bitmap(), "**, !scope/bar").unwrap(), vec!["scope/foo@1.0.0"]);
}
#[test]
fn invalid_ranges_are_rejected_before_configuration_changes() {
    assert!(validate_range(Some("not-a-version")).is_err());
    assert!(validate_range(Some("^1 || >=2 <3")).is_ok());
}
