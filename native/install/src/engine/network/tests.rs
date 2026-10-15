use super::{NetworkSettings, ProxySettings, RetrySettings, network, proxy, read_ca_file};
use crate::{config::DependencyResolverConfig, model::GlobalConfig};
use pnpm_network::NoProxySetting;
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use std::fs;

fn global(entries: &[(&str, Value)]) -> GlobalConfig {
    entries
        .iter()
        .map(|(key, value)| ((*key).to_string(), value.clone()))
        .collect()
}

#[test]
fn the_dependency_resolver_proxy_wins() {
    let config = DependencyResolverConfig {
        proxy: Some("http://dr:1".to_string()),
        no_proxy: Some("a,b".to_string()),
        ..DependencyResolverConfig::default()
    };
    let mut pnpm = pnpm_config::Config::default();
    pnpm.proxy.http_proxy = Some("http://npmrc:2".to_string());
    let settings = proxy(&pnpm, &config, &global(&[("proxy", json!("http://global:3"))]));
    assert_eq!(
        settings,
        ProxySettings {
            http_proxy: Some("http://dr:1".to_string()),
            https_proxy: Some("http://dr:1".to_string()),
            no_proxy: Some(json!("a,b")),
        },
    );
    assert_eq!(
        settings.to_engine().no_proxy,
        Some(NoProxySetting::List(vec!["a".to_string(), "b".to_string()])),
    );
}

#[test]
fn the_pnpm_cascade_proxy_comes_before_the_global_one() {
    let mut pnpm = pnpm_config::Config::default();
    pnpm.proxy.http_proxy = Some("http://npmrc:2".to_string());
    let settings = proxy(
        &pnpm,
        &DependencyResolverConfig::default(),
        &global(&[("proxy", json!("http://global:3"))]),
    );
    assert_eq!(settings.https_proxy.as_deref(), Some("http://npmrc:2"));
}

#[test]
fn the_global_proxy_is_the_last_resort() {
    let settings = proxy(
        &pnpm_config::Config::default(),
        &DependencyResolverConfig::default(),
        &global(&[("proxy", json!("http://global:3")), ("https_proxy", json!("https://global:4"))]),
    );
    assert_eq!(settings.http_proxy.as_deref(), Some("http://global:3"));
    assert_eq!(settings.https_proxy.as_deref(), Some("https://global:4"));
}

#[test]
fn no_proxy_configured_anywhere_is_empty() {
    let settings = proxy(
        &pnpm_config::Config::default(),
        &DependencyResolverConfig::default(),
        &GlobalConfig::new(),
    );
    assert_eq!(settings, ProxySettings::default());
}

#[test]
fn network_defaults_come_from_the_global_config() {
    let settings = network(
        &pnpm_config::Config::default(),
        &DependencyResolverConfig::default(),
        &GlobalConfig::new(),
    )
    .expect("network settings");
    assert_eq!(
        settings,
        NetworkSettings {
            retry: RetrySettings {
                fetch_retries: Some(5),
                fetch_retry_factor: Some(10),
                fetch_retry_mintimeout: Some(1000),
                fetch_retry_maxtimeout: Some(60_000),
                fetch_timeout: Some(60_000),
            },
            max_sockets: Some(15),
            user_agent: Some("bit user/anonymous".to_string()),
            ..NetworkSettings::default()
        },
    );
}

#[test]
fn the_dependency_resolver_network_config_wins() {
    let config = DependencyResolverConfig {
        fetch_retries: Some(7),
        strict_ssl: Some(json!("false")),
        ca: Some("PEM".to_string()),
        ..DependencyResolverConfig::default()
    };
    let settings = network(
        &pnpm_config::Config::default(),
        &config,
        &global(&[
            ("network.fetch_retries", json!("3")),
            ("user.name", json!("alice")),
            ("network.strict-ssl", json!(true)),
        ]),
    )
    .expect("network settings");
    assert_eq!(settings.retry.fetch_retries, Some(7));
    assert_eq!(settings.tls.strict_ssl, Some(false));
    assert_eq!(settings.tls.ca, Some(vec!["PEM".to_string()]));
    assert_eq!(settings.user_agent.as_deref(), Some("bit user/alice"));
}

#[test]
fn a_global_cafile_is_read_into_ca() {
    let dir = tempfile::tempdir().expect("temp dir");
    let cafile = dir.path().join("ca.pem");
    fs::write(&cafile, "-----BEGIN CERTIFICATE-----\r\nA\r\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nB\n-----END CERTIFICATE-----\n")
        .expect("write ca");
    let settings = network(
        &pnpm_config::Config::default(),
        &DependencyResolverConfig::default(),
        &global(&[("network.cafile", json!(cafile.display().to_string()))]),
    )
    .expect("network settings");
    assert_eq!(
        settings.tls.ca,
        Some(vec![
            "-----BEGIN CERTIFICATE-----\nA\n-----END CERTIFICATE-----".to_string(),
            "-----BEGIN CERTIFICATE-----\nB\n-----END CERTIFICATE-----".to_string(),
        ]),
    );
}

#[test]
fn a_missing_cafile_is_ignored() {
    assert_eq!(read_ca_file(std::path::Path::new("/does/not/exist.pem")).expect("read"), None);
}
