use super::{allowed_scripts, resolve, trusted_package_names};
use crate::config::DependencyResolverConfig;
use indexmap::IndexMap;
use pretty_assertions::assert_eq;
use serde_json::{Value, json};

fn allow(entries: &[(&str, Value)]) -> IndexMap<String, Value> {
    entries
        .iter()
        .map(|(name, value)| ((*name).to_string(), value.clone()))
        .collect()
}

#[test]
fn the_trusted_list_is_vendored() {
    let names = trusted_package_names();
    assert_eq!(names.len(), 367);
    assert!(
        names
            .iter()
            .any(|name| name == "esbuild"),
    );
}

#[test]
fn trusted_packages_are_allowed_unless_configured() {
    let configured = allow(&[("esbuild", json!(false))]);
    let policy = resolve(Some(&configured), false, &[]);
    assert_eq!(policy.allow_builds.get("esbuild"), Some(&false));
    assert_eq!(policy.allow_builds.get("@airbnb/node-memwatch"), Some(&true));
}

#[test]
fn untrusted_packages_are_disallowed_unless_explicitly_allowed() {
    let configured = allow(&[("core-js", json!(true)), ("less", json!("warn"))]);
    let policy = resolve(Some(&configured), false, &[]);
    assert_eq!(policy.allow_builds.get("core-js"), Some(&true));
    assert_eq!(policy.allow_builds.get("less"), Some(&false));
    assert_eq!(policy.allow_builds.get("es5-ext"), Some(&false));
}

#[test]
fn warn_placeholders_are_not_forwarded() {
    let configured = allow(&[("my-pkg", json!("warn"))]);
    assert_eq!(resolve(Some(&configured), false, &[]).allow_builds.get("my-pkg"), None);
}

#[test]
fn never_built_dependencies_win() {
    let configured = allow(&[("x", json!(true))]);
    let policy = resolve(Some(&configured), false, &["x".to_string()]);
    assert_eq!(policy.allow_builds.get("x"), Some(&false));
    assert!(policy.never_build_package_names.is_empty());
}

#[test]
fn dangerously_allow_all_scripts_allows_everything() {
    let policy = resolve(None, true, &[]);
    assert_eq!(policy.dangerously_allow_all_builds, Some(true));
    assert!(policy.allow_builds.is_empty());
}

#[test]
fn dangerously_allow_all_scripts_with_never_built_strips_their_scripts() {
    let policy = resolve(None, true, &["x".to_string()]);
    assert_eq!(policy.dangerously_allow_all_builds, None);
    assert_eq!(policy.allow_builds.get("x"), Some(&false));
    assert_eq!(policy.never_build_package_names, vec!["x".to_string()]);
}

#[test]
fn bit_allow_scripts_is_merged_over_the_config() {
    let config = DependencyResolverConfig {
        allow_scripts: Some(allow(&[("a", json!(true)), ("b", json!(true))])),
        ..DependencyResolverConfig::default()
    };
    let merged =
        allowed_scripts(&config, Some(r#"{"b":false,"c":true}"#)).expect("merged").expect("some");
    assert_eq!(merged, allow(&[("a", json!(true)), ("b", json!(false)), ("c", json!(true))]));
}

#[test]
fn bit_allow_scripts_must_be_a_json_object() {
    let config = DependencyResolverConfig::default();
    let error = allowed_scripts(&config, Some("[]")).expect_err("array");
    assert_eq!(error.to_string(), "BIT_ALLOW_SCRIPTS must be a JSON object");
    let error = allowed_scripts(&config, Some("{")).expect_err("invalid");
    assert_eq!(
        error.to_string(),
        "Failed to parse the JSON object in the BIT_ALLOW_SCRIPTS environment variable",
    );
}
