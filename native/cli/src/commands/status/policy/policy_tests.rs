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
fn removed_merge_config_is_visible_to_dependency_projection() {
    let version = json!({"extensions":[{"name":"teambit.component/remove","config":{"removed":true},"data":{}}]});
    let target = json!({"mergedConfigNames":["teambit.component/remove"]});
    let extensions = super::extensions::status_extensions(Some(&version), &target).unwrap();
    assert_eq!(extensions[0]["name"], "teambit.component/remove");
    assert_eq!(extensions[0]["config"]["removed"], true);
    let custom = json!({"mergedConfigNames":["custom/aspect"]});
    assert!(super::extensions::status_extensions(Some(&version), &custom).is_err());
}

#[test]
fn pending_soft_removal_is_projected_but_other_merge_config_stays_canonical() {
    let target =
        json!({"resolveConfig":true,"mergedConfig":{"teambit.component/remove":{"removed":true}}});
    assert!(!super::extensions::pending_merge_config(&target));
    let projected =
        super::extensions::status_extensions(Some(&json!({"extensions":[]})), &target).unwrap();
    assert_eq!(
        projected,
        vec![json!({"name":"teambit.component/remove","config":{"removed":true}})],
    );
    let custom =
        json!({"resolveConfig":true,"mergedConfig":{"teambit.component/remove":{"removed":false}}});
    assert!(super::extensions::pending_merge_config(&custom));
    let dependency = json!({"resolveConfig":true,"mergedConfig":{"teambit.dependencies/dependency-resolver":{"policy":{}}}});
    assert!(super::extensions::pending_merge_config(&dependency));
}
