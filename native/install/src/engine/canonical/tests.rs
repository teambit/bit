use super::{
    CanonicalInstall,
    environment::{Captured, CapturedHost},
    parse::Request,
};
use crate::host::HostInfo;
use serde_json::{Value, json};
use std::{path::Path, time::Duration};

fn request(root: &Path) -> Value {
    let mut input = json!({
        "rootDir":root,
        "manifestsByPaths":{},
        "storeDir":root.join("store"),
        "cacheDir":root.join("cache"),
        "registryMap":{"default":"https://registry.npmjs.org/"},
        "authHeaderByUri":{},
        "proxyConfig":{},
        "networkConfig":{},
        "options":{"nodeLinker":"isolated","returnListOfDepsRequiringBuild":true},
        "bitDir":root.join("bit"),
        "environment":std::env::vars().collect::<std::collections::BTreeMap<_, _>>(),
        "cwd":std::env::current_dir().expect("test current directory"),
    });
    input["manifestsByPaths"][root.to_string_lossy().as_ref()] = json!({"name":"workspace"});
    input
}

#[test]
fn accepts_actual_scalar_package_boundary() {
    let dir = tempfile::tempdir().expect("private root");
    let input = request(dir.path());
    let parsed = Request::new(&input).expect("the published scalar package boundary");
    assert_eq!(parsed.projects.len(), 1);
    assert_eq!(parsed.network.registry_map["default"], "https://registry.npmjs.org/");
}

#[test]
fn declines_unknown_package_option_before_native_install() {
    let dir = tempfile::tempdir().expect("private root");
    let mut input = request(dir.path());
    input["options"]["customMutation"] = json!(true);
    assert!(Request::new(&input).is_none());
}

#[test]
fn declines_incomplete_manifest_inventory_before_native_install() {
    let dir = tempfile::tempdir().expect("private root");
    let mut input = request(dir.path());
    input["manifestsByPaths"] = json!({});
    assert!(Request::new(&input).is_none());
}

#[test]
fn published_mutations_reach_native_engine_settings() {
    let dir = tempfile::tempdir().expect("private root");
    let mut input = request(dir.path());
    input["registryMap"]["@example"] = json!("https://example.test/");
    input["authHeaderByUri"]["//example.test/"] = json!("Bearer token");
    input["options"]["includeOptionalDeps"] = json!(false);
    input["options"]["hoistPattern"] = json!(["*", "!private"]);
    input["options"]["reportOptions"] = json!({"throttleProgress": 60000});
    let prepared = CanonicalInstall::prepare(&input, &HostInfo::default())
        .expect("the supported published scalar mutations");
    assert!(!prepared.options.include_optional_deps);
    assert_eq!(prepared.settings.layout.hoist_pattern, ["*", "!private"]);
    assert_eq!(prepared.settings.registry.registries.to_map()["@example"], "https://example.test/");
    assert_eq!(prepared.settings.registry.auth_header_by_uri["//example.test/"], "Bearer token");
    assert_eq!(
        prepared.settings.reporter.expect("visible reporter").throttle_progress,
        Duration::from_mins(1),
    );
}

#[test]
fn pnpm_config_expands_the_captured_host_environment() {
    let dir = tempfile::tempdir().expect("private root");
    std::fs::write(
        dir.path().join("pnpm-workspace.yaml"),
        "packages: []\ncacheDir: ${BIT_NATIVE_CONFIG_CACHE}\n",
    )
    .expect("private workspace config");
    let mut input = request(dir.path());
    input["environment"]["BIT_NATIVE_CONFIG_CACHE"] = json!(dir.path().join("captured-cache"));
    input["environment"]["HOME"] = json!(dir.path());
    input["environment"]["XDG_CONFIG_HOME"] = json!(dir.path());
    let environment = Captured::parse(&input).expect("captured Host environment");
    let config = environment
        .with(|| pnpm_config::Config::default().current::<CapturedHost>(dir.path()))
        .expect("pnpm configuration from captured Host");
    assert_eq!(config.cache_dir, dir.path().join("captured-cache"));
}

#[test]
fn removed_host_variable_declines_before_lifecycle_scripts() {
    let dir = tempfile::tempdir().expect("private root");
    let mut input = request(dir.path());
    let inherited = std::env::vars().next().expect("test process environment").0;
    input["environment"]
        .as_object_mut()
        .expect("environment map")
        .remove(&inherited);
    let environment = Captured::parse(&input).expect("captured Host environment");
    assert!(!environment.can_inherit_parent());
    assert!(CanonicalInstall::prepare(&input, &HostInfo::default()).is_none());
}

#[test]
fn omitted_napi_options_retain_nondefault_pnpm_configuration() {
    let dir = tempfile::tempdir().expect("private root");
    std::fs::write(
        dir.path().join("pnpm-workspace.yaml"),
        "packages: []\nnodeLinker: hoisted\nautoInstallPeers: false\n\
         dedupePeers: false\ndedupeInjectedDeps: true\nengineStrict: true\n\
         publicHoistPattern:\n  - '*lint*'\n",
    )
    .expect("private workspace config");
    let mut input = request(dir.path());
    input["options"]
        .as_object_mut()
        .expect("package options")
        .remove("nodeLinker");
    input["environment"]["HOME"] = json!(dir.path());
    input["environment"]["XDG_CONFIG_HOME"] = json!(dir.path());
    let prepared = CanonicalInstall::prepare(&input, &HostInfo::default())
        .expect("configured pnpm defaults remain supported");
    assert_eq!(prepared.settings.layout.node_linker, "hoisted");
    assert_eq!(prepared.settings.layout.public_hoist_pattern, ["*lint*"]);
    assert!(!prepared.settings.resolution.auto_install_peers);
    assert!(!prepared.settings.resolution.dedupe_peers);
    assert!(prepared.settings.resolution.dedupe_injected_deps);
    assert!(prepared.settings.resolution.engine_strict);
}

#[test]
fn omitted_global_store_option_keeps_configured_value() {
    let dir = tempfile::tempdir().expect("private root");
    std::fs::write(
        dir.path().join("pnpm-workspace.yaml"),
        "packages: []\nenableGlobalVirtualStore: true\n",
    )
    .expect("private workspace config");
    let mut input = request(dir.path());
    input["environment"]["HOME"] = json!(dir.path());
    input["environment"]["XDG_CONFIG_HOME"] = json!(dir.path());
    let prepared = CanonicalInstall::prepare(&input, &HostInfo::default())
        .expect("configured global store remains supported");
    assert!(prepared.settings.layout.enable_global_virtual_store);
}
