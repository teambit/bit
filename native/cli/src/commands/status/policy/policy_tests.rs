//! Unit tests for component ID [`package_name`] conversion and pending extension configuration projection.
//!
//! Verifies default `@scope/name` and custom prefix formatting in [`package_name`] alongside origin-ordered extension config projection.

use super::names::package_name;
use serde_json::json;

/// Verifies [`package_name`] matches `componentIdToPackageName` across default and custom prefixes.
///
/// Checks both default scope splitting (`my.scope` -> `@my/scope.*`) and explicit `@teambit` / `@bit` prefixes.
#[test]
fn package_name_matches_component_id_to_package_name() {
    assert_eq!(package_name("my.scope/ui/button", None), "@my/scope.ui.button");
    assert_eq!(package_name("teambit.design/ui/x", Some("@teambit")), "@teambit/design.ui.x");
    assert_eq!(package_name("org.scope/a", Some("@bit")), "@bit/org.scope.a");
    assert_eq!(package_name("scope/a", None), "@scope/a");
}

/// Verifies that pending component [`json`] extension configuration is projected alongside stored version extensions.
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

/// Verifies that [`package_name`] replaces `/` separators in nested component namespaces with `.`.
///
/// Ensures multi-segment component names map to flat dot-separated npm package names.
#[test]
fn package_name_replaces_slashes_in_nested_namespaces_with_dots() {
    assert_eq!(package_name("scope/a/b/c", None), "@scope/a.b.c");
}

#[test]
fn removed_bitmap_components_are_separate_version_sources() {
    let context = json!({"targets":[
        {"identity":"sample.scope/live", "version":"1.0.0"},
        {"identity":"sample.scope/deleted", "version":"2.0.0", "locallyRemoved":true},
    ]});
    assert_eq!(super::bitmap_identities(&context, false).unwrap(), ["sample.scope/live@1.0.0"]);
    assert_eq!(super::bitmap_identities(&context, true).unwrap(), ["sample.scope/deleted@2.0.0"]);
}
