use super::package_name;
use serde_json::json;

#[test]
fn package_name_matches_component_id_to_package_name() {
    assert_eq!(package_name("my.scope/ui/button", None), "@my/scope.ui.button");
    assert_eq!(package_name("teambit.design/ui/x", Some("@teambit")), "@teambit/design.ui.x");
    assert_eq!(package_name("org.scope/a", Some("@bit")), "@bit/org.scope.a");
    assert_eq!(package_name("scope/a", None), "@scope/a");
}

#[test]
fn pending_component_configuration_is_projected_by_origin() {
    let version =
        json!({"extensions":[{"name":"teambit.component/remove","config":{"removed":true}}]});
    let context = json!({"targets":[]});
    let target = json!({"identity":"scope/name","directory":"name","resolveConfig":true,
        "mergedConfig":{"teambit.dependencies/dependency-resolver":{"policy":{"dependencies":{"pkg":"1"}}}}});
    let rows = super::projection::extensions(&context, &target, Some(&version)).unwrap();
    assert!(
        rows.iter()
            .any(|row| row["name"] == "teambit.dependencies/dependency-resolver"),
    );
    assert!(
        rows.iter()
            .any(|row| row["name"] == "teambit.component/remove"),
    );
}
