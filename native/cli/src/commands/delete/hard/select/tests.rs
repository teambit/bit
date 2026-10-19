use super::wildcard;

#[test]
fn wildcard_matches_nested_namespaces_without_matching_other_prefixes() {
    assert!(wildcard("ui/*", "ui/button"));
    assert!(wildcard("ui/**", "ui/form/button"));
    assert!(!wildcard("ui/*", "other/button"));
    assert!(!wildcard("ui/button", "ui/buttons"));
}
