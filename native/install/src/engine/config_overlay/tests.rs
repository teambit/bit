use super::{CallOverlay, Query, install_config, query_config};
use crate::{
    config::DependencyResolverConfig,
    engine::{EnvVars, settings},
    host::HostInfo,
    model::{DependencyMap, GlobalConfig},
};
use pnpm_config::{LinkWorkspacePackages, NodeLinker};
use pretty_assertions::assert_eq;
use serde_json::json;

/// The settings of an empty workspace, and the directory that holds it.
fn engine_settings(
    config: &DependencyResolverConfig,
    global: &GlobalConfig,
) -> (tempfile::TempDir, crate::engine::EngineSettings) {
    let dir = tempfile::tempdir().expect("temp dir");
    let settings = settings(dir.path(), config, global, &HostInfo::default(), &EnvVars::default())
        .expect("settings");
    (dir, settings)
}

#[test]
fn applies_bits_fixed_install_options() {
    let (_dir, settings) =
        engine_settings(&DependencyResolverConfig::default(), &GlobalConfig::new());
    let overrides = DependencyMap::from([("a".to_string(), "1".to_string())]);
    let config = install_config(
        &settings,
        &CallOverlay {
            overrides: &overrides,
            forced_harmony_version: Some("0.4.7"),
            external_dependencies: &[],
            update_all: false,
        },
    )
    .expect("config");
    assert_eq!(config.link_workspace_packages, LinkWorkspacePackages::Deep);
    assert!(config.inject_workspace_packages);
    assert!(config.dedupe_peer_dependents);
    assert!(config.dedupe_direct_deps);
    assert!(config.resolve_peers_from_workspace_root);
    assert!(config.exclude_links_from_lockfile);
    assert!(config.trust_lockfile);
    assert!(!config.strict_dep_builds);
    assert!(config.prefer_frozen_lockfile);
    assert_eq!(config.node_linker, NodeLinker::Isolated);
    assert_eq!(config.peers_suffix_max_length, 1000);
    assert_eq!(config.minimum_release_age, Some(0));
    assert_eq!(config.registry, "https://node-registry.bit.cloud/");
    let overrides = config.overrides.as_ref().expect("overrides");
    assert_eq!(overrides["a"], "1");
    assert_eq!(overrides["@teambit/harmony"], "0.4.7");
    assert_eq!(config.peer_dependency_rules.allow_any, Some(vec!["*".to_string()]));
}

#[test]
fn root_components_are_not_hoisted() {
    let config = DependencyResolverConfig {
        root_components: Some(true),
        ..DependencyResolverConfig::default()
    };
    let (_dir, settings) = engine_settings(&config, &GlobalConfig::new());
    let externals = ["comp".to_string()];
    let config = install_config(
        &settings,
        &CallOverlay {
            overrides: &DependencyMap::new(),
            forced_harmony_version: None,
            external_dependencies: &externals,
            update_all: true,
        },
    )
    .expect("config");
    assert_eq!(config.hoist_pattern, Some(vec!["*".to_string(), "!comp".to_string()]));
    assert!(config.external_dependencies.contains("comp"));
    assert!(!config.prefer_frozen_lockfile);
}

#[test]
fn the_default_registry_token_is_pinned_to_the_default_registry() {
    let global = GlobalConfig::from([("user.token".to_string(), json!("tok"))]);
    let (_dir, settings) = engine_settings(&DependencyResolverConfig::default(), &global);
    let config = install_config(
        &settings,
        &CallOverlay {
            overrides: &DependencyMap::new(),
            forced_harmony_version: None,
            external_dependencies: &[],
            update_all: false,
        },
    )
    .expect("config");
    assert_eq!(
        config.auth_headers.for_url("https://node-registry.bit.cloud/some-pkg").as_deref(),
        Some("Bearer tok"),
    );
}

#[test]
fn identical_configs_are_interned_once() {
    let (_dir, settings) =
        engine_settings(&DependencyResolverConfig::default(), &GlobalConfig::new());
    let first = query_config(&settings, &Query::Resolve);
    let second = query_config(&settings, &Query::Resolve);
    assert!(std::ptr::eq(first, second));
    let overrides = DependencyMap::new();
    let peers = query_config(&settings, &Query::PeerIssues { overrides: &overrides });
    assert!(!peers.auto_install_peers);
}
