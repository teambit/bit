use super::package_name;

#[test]
fn package_name_matches_component_id_to_package_name() {
    assert_eq!(package_name("my.scope/ui/button", None), "@my/scope.ui.button");
    assert_eq!(package_name("teambit.design/ui/x", Some("@teambit")), "@teambit/design.ui.x");
    assert_eq!(package_name("org.scope/a", Some("@bit")), "@bit/org.scope.a");
    assert_eq!(package_name("scope/a", None), "@scope/a");
}
