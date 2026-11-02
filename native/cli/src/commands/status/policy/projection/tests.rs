//! Unit tests for aspect configuration origin precedence and variant specificity rules ([`RESOLVER`]) in workspace status.
//!
//! Verifies `.bitmap` (`componentConfig`), `component.json`, variant, and stored version merge order.

use serde_json::{Value, json};

/// Canonical aspect ID for `teambit.dependencies/dependency-resolver`.
const RESOLVER: &str = "teambit.dependencies/dependency-resolver";

/// Builds a sample component target JSON fixture for aspect configuration projection tests.
fn target() -> Value {
    json!({"identity":"scope/ui/button","directory":"comps/ui/button","version":"1.0.0"})
}

/// Verifies that aspect configuration precedence for [`target`] matches `ConfigMerger` (`.bitmap` > `component.json` > variants > stored).
#[test]
fn origin_precedence_matches_aspects_merger() {
    let mut target = target();
    target["componentConfig"] = json!({RESOLVER:{"policy":{"dependencies":{"bitmap":"1"}}}});
    target["config"] =
        json!({"propagate":true,"extensions":{RESOLVER:{"policy":{"dependencies":{"file":"2"}}}}});
    let context = json!({"targets":[&target],"workspace":{"teambit.workspace/variants":{"*":{RESOLVER:{"policy":{"dependencies":{"variant":"3"}}}}}}});
    let version = json!({"extensions":[{"name":RESOLVER,"config":{"__specific":true,"policy":{"dependencies":{"stored":"4"}}}}]});
    let rows = super::extensions(&context, &target, Some(&version)).unwrap();
    assert_eq!(
        rows[0]["config"],
        json!({"policy":{"dependencies":{"bitmap":"1"}},"__specific":true}),
    );
    target
        .as_object_mut()
        .unwrap()
        .remove("componentConfig");
    let rows = super::extensions(&context, &target, Some(&version)).unwrap();
    assert_eq!(
        rows[0]["config"],
        json!({"policy":{"dependencies":{"file":"2"}},"__specific":true}),
    );
}

#[test]
fn variant_specificity_exclusions_and_propagation_share_installer_rules() {
    let target = target();
    let context = json!({"targets":[&target],"workspace":{"teambit.workspace/variants":{
        "*":{RESOLVER:{"policy":{"dependencies":{"global":"1"}}}},
        "comps/ui":{RESOLVER:{"policy":{"dependencies":{"directory":"2"}}},"propagate":false},
        "comps/ui, !comps/ui/excluded":{"teambit.pkg/pkg":{"packageJson":{"name":"@custom/{name}"}}},
        "{ui/**}":{RESOLVER:{"policy":{"dependencies":{"namespace":"3"}}}}
    }}});
    let rows = super::extensions(&context, &target, None).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["name"], "teambit.pkg/pkg");
    assert_eq!(rows[1]["config"]["policy"]["dependencies"], json!({"directory":"2"}));
}

#[test]
fn target_without_variant_or_stored_config_projects_empty_extensions() {
    let target = target();
    let context = json!({"targets":[&target],"workspace":{}});
    assert!(super::extensions(&context, &target, None).unwrap().is_empty());
}
