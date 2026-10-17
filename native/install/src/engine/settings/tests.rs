use super::{
    EnvVars, enable_global_virtual_store, hoist_pattern, package_extensions, peer_dependency_rules,
    settings,
};
use crate::{config::DependencyResolverConfig, host::HostInfo, model::GlobalConfig};
use pretty_assertions::assert_eq;
use serde_json::json;

fn patterns(items: &[&str]) -> Vec<String> {
    items
        .iter()
        .map(ToString::to_string)
        .collect()
}

#[test]
fn hoist_pattern_prefers_a_non_default_pnpm_pattern_over_the_bit_default() {
    assert_eq!(hoist_pattern(None, None), patterns(&["*"]));
    assert_eq!(hoist_pattern(None, Some(&patterns(&["a*"]))), patterns(&["a*"]));
    assert_eq!(hoist_pattern(Some(&patterns(&["*"])), Some(&patterns(&["a*"]))), patterns(&["a*"]));
    assert_eq!(
        hoist_pattern(Some(&patterns(&["b*"])), Some(&patterns(&["a*"]))),
        patterns(&["b*"]),
    );
    assert_eq!(hoist_pattern(Some(&patterns(&["*"])), Some(&patterns(&["*"]))), patterns(&["*"]));
}

#[test]
fn the_global_virtual_store_follows_env_then_config_then_global_config() {
    let config = DependencyResolverConfig::default();
    let on = EnvVars { enable_global_virtual_store: Some("1".to_string()), ..EnvVars::default() };
    assert!(enable_global_virtual_store(&config, &GlobalConfig::new(), &on));
    let configured_off =
        DependencyResolverConfig { enable_global_virtual_store: Some(false), ..config.clone() };
    let global_on =
        GlobalConfig::from([("enable_global_virtual_store".to_string(), json!("true"))]);
    assert!(!enable_global_virtual_store(&configured_off, &global_on, &EnvVars::default()));
    assert!(enable_global_virtual_store(&config, &global_on, &EnvVars::default()));
    let hoisted = DependencyResolverConfig { node_linker: Some("hoisted".to_string()), ..config };
    assert!(!enable_global_virtual_store(&hoisted, &global_on, &on));
}

#[test]
fn built_in_package_extensions_apply_under_the_global_virtual_store_only() {
    let configured =
        indexmap::IndexMap::from([("x@1".to_string(), json!({ "dependencies": { "y": "1" } }))]);
    assert_eq!(package_extensions(Some(&configured), false), Some(configured.clone()));
    let extensions = package_extensions(Some(&configured), true).expect("extensions");
    assert_eq!(
        extensions["@teambit/react.react-env@1"],
        json!({ "dependencies": { "@teambit/react": "^1.0.0" } }),
    );
    assert_eq!(extensions["x@1"], configured["x@1"]);
    assert_eq!(package_extensions(None, false), None);
}

#[test]
fn peer_dependency_warnings_are_suppressed_by_default() {
    assert_eq!(peer_dependency_rules(None), json!({ "allowAny": ["*"], "ignoreMissing": ["*"] }));
    assert_eq!(
        peer_dependency_rules(Some(&json!({ "allowAny": [], "allowedVersions": { "a": "1" } }))),
        json!({ "allowAny": [], "ignoreMissing": ["*"], "allowedVersions": { "a": "1" } }),
    );
}

#[test]
fn resolves_settings_for_a_workspace() {
    let dir = tempfile::tempdir().expect("temp dir");
    let config = DependencyResolverConfig {
        root_components: Some(true),
        never_built_dependencies: Some(vec!["x".to_string()]),
        ..DependencyResolverConfig::default()
    };
    let info = HostInfo { columns: Some(100), color: true, ..HostInfo::default() };
    let settings = settings(dir.path(), &config, &GlobalConfig::new(), &info, &EnvVars::default())
        .expect("settings");
    assert!(settings.layout.root_components);
    assert_eq!(settings.layout.node_linker, "isolated");
    assert_eq!(settings.policy.minimum_release_age, 0);
    assert!(settings.resolution.auto_install_peers);
    assert_eq!(settings.policy.scripts.allow_builds.get("x"), Some(&false));
    assert_eq!(settings.reporter.as_ref().map(|reporter| reporter.width), Some(98));
    assert_eq!(settings.registry.registries.default.uri, "https://node-registry.bit.cloud/");
}
