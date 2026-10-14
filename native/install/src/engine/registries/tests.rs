use super::{Registries, Registry, bit_cloud_registry, resolve};
use crate::{config::DependencyResolverConfig, model::GlobalConfig};
use indexmap::IndexMap;
use pretty_assertions::assert_eq;
use serde_json::json;
use std::collections::HashMap;

fn global(entries: &[(&str, &str)]) -> GlobalConfig {
    entries
        .iter()
        .map(|(key, value)| ((*key).to_string(), json!(value)))
        .collect()
}

fn npmjs_config() -> pnpm_config::Config {
    pnpm_config::Config {
        registry: "https://registry.npmjs.org/".to_string(),
        ..pnpm_config::Config::default()
    }
}

#[test]
fn the_cloud_registry_follows_the_configured_domain() {
    assert_eq!(bit_cloud_registry(&GlobalConfig::new()), "https://node-registry.bit.cloud/");
    assert_eq!(
        bit_cloud_registry(&global(&[("cloud_domain", "example.com")])),
        "https://node-registry.example.com/",
    );
}

#[test]
fn npmjs_is_replaced_by_the_bit_registry_with_the_user_token() {
    let registries = resolve(
        &npmjs_config(),
        &DependencyResolverConfig::default(),
        &global(&[("user.token", "tok")]),
    );
    assert_eq!(
        registries.default,
        Registry {
            uri: "https://node-registry.bit.cloud/".to_string(),
            always_auth: true,
            auth_header_value: "Bearer tok".to_string(),
        },
    );
    // The `bit` scope gets Bit's token too.
    assert_eq!(registries.scopes["bit"].auth_header_value, "Bearer tok");
}

#[test]
fn the_registry_global_config_overrides_the_cloud_registry() {
    let registries = resolve(
        &npmjs_config(),
        &DependencyResolverConfig::default(),
        &global(&[("registry", "https://my.registry/")]),
    );
    assert_eq!(registries.default.uri, "https://my.registry/");
    assert!(!registries.default.always_auth);
}

#[test]
fn install_from_bit_dev_registry_false_keeps_npmjs() {
    let config = DependencyResolverConfig {
        install_from_bit_dev_registry: Some(false),
        ..DependencyResolverConfig::default()
    };
    let registries = resolve(&npmjs_config(), &config, &GlobalConfig::new());
    assert_eq!(registries.default.uri, "https://registry.npmjs.org/");
}

#[test]
fn a_custom_default_registry_is_kept() {
    let config = pnpm_config::Config {
        registry: "https://custom.example/".to_string(),
        ..pnpm_config::Config::default()
    };
    let registries = resolve(&config, &DependencyResolverConfig::default(), &GlobalConfig::new());
    assert_eq!(registries.default.uri, "https://custom.example/");
}

#[test]
fn scoped_registries_lose_their_at_sign() {
    let mut config = npmjs_config();
    config.registries_by_scope.insert("@acme".to_string(), "https://acme.example/".to_string());
    let registries = resolve(&config, &DependencyResolverConfig::default(), &GlobalConfig::new());
    assert_eq!(registries.scopes["acme"].uri, "https://acme.example/");
    assert_eq!(registries.to_map()["@acme"], "https://acme.example/");
}

#[test]
fn npmrc_credentials_become_registry_headers() {
    let mut config = npmjs_config();
    config.registries_by_scope.insert("@acme".to_string(), "https://acme.example/".to_string());
    config.auth_headers = std::sync::Arc::new(pnpm_network::AuthHeaders::from_map(HashMap::from(
        [("//acme.example/".to_string(), "Bearer acme".to_string())],
    )));
    let registries = resolve(&config, &DependencyResolverConfig::default(), &GlobalConfig::new());
    assert_eq!(registries.scopes["acme"].auth_header_value, "Bearer acme");
    assert!(registries.scopes["acme"].always_auth);
}

#[test]
fn auth_headers_are_keyed_by_nerf_dart_and_the_default_by_empty_string() {
    let registries = Registries {
        default: Registry {
            uri: "https://default.example/".to_string(),
            always_auth: true,
            auth_header_value: "Bearer d".to_string(),
        },
        scopes: IndexMap::from([(
            "acme".to_string(),
            Registry {
                uri: "https://acme.example/npm/".to_string(),
                always_auth: true,
                auth_header_value: "Bearer a".to_string(),
            },
        )]),
    };
    let headers = registries.auth_header_by_uri();
    assert_eq!(headers["//acme.example/npm/"], "Bearer a");
    assert_eq!(headers["//default.example/"], "Bearer d");
    assert_eq!(headers[""], "Bearer d");
}

#[test]
fn registries_without_credentials_send_no_header() {
    let registries = Registries {
        default: Registry { uri: "https://default.example/".to_string(), ..Registry::default() },
        scopes: IndexMap::from([(
            "bit".to_string(),
            Registry { uri: "https://node-registry.bit.cloud/".to_string(), ..Registry::default() },
        )]),
    };
    assert!(registries.auth_header_by_uri().is_empty());
}
