use super::Resolver;
use crate::GlobalConfig;
use serde_json::json;
use std::{fs, path::PathBuf};
use tempfile::TempDir;

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

fn resolver(dir: &TempDir, body: &str, token: Option<&str>) -> Resolver {
    let path = dir.path().join("resolver.js");
    fs::write(&path, body).unwrap();
    let mut global = GlobalConfig::default();
    if let Some(token) = token {
        global.insert("user.token".into(), json!(token));
    }
    let scope_json = json!({ "name": "local", "resolverPath": path.display().to_string() });
    Resolver::configured(&scope_json, PathBuf::new(), PathBuf::new(), "local", &global).unwrap()
}

#[test]
fn only_a_configured_resolver_path_is_used() {
    let global = GlobalConfig::default();
    for scope_json in
        [json!({ "name": "local" }), json!({ "resolverPath": "" }), json!({ "resolverPath": null })]
    {
        assert!(
            Resolver::configured(&scope_json, PathBuf::new(), PathBuf::new(), "local", &global)
                .is_none(),
        );
    }
}

#[test]
fn the_module_gets_the_scope_this_scope_and_the_configured_token() {
    let dir = TempDir::new().unwrap();
    let body = "module.exports = (scope, thisScope, token) => Promise.resolve(`file:///${scope}/${thisScope}/${token}`);";
    let url = runtime()
        .block_on(resolver(&dir, body, Some("secret")).resolve("remote"))
        .unwrap();
    assert_eq!(url, "file:///remote/local/secret");
    let url = runtime()
        .block_on(resolver(&dir, body, None).resolve("remote"))
        .unwrap();
    assert_eq!(url, "file:///remote/local/undefined", "a missing token is undefined, as in Bit");
}

#[test]
fn a_rejection_or_a_broken_module_is_the_error() {
    let dir = TempDir::new().unwrap();
    let rejects = "module.exports = () => Promise.reject(new Error('no such scope'));";
    let error = runtime()
        .block_on(resolver(&dir, rejects, None).resolve("remote"))
        .unwrap_err();
    assert_eq!(error.to_string(), "no such scope");
    let broken = "module.exports = ;";
    let error = runtime()
        .block_on(resolver(&dir, broken, None).resolve("remote"))
        .unwrap_err();
    assert!(error.to_string().contains("SyntaxError"), "{error}");
}

#[test]
fn a_relative_path_resolves_from_the_remote_resolver_module_of_bit() {
    let dir = TempDir::new().unwrap();
    let bit_dir = dir.path().join("node_modules/@teambit/bit");
    let remotes = dir.path().join("node_modules/@teambit/scope.remotes");
    fs::create_dir_all(&bit_dir).unwrap();
    fs::create_dir_all(remotes.join("dist/remote-resolver")).unwrap();
    fs::write(
        remotes.join("package.json"),
        r#"{"name":"@teambit/scope.remotes","main":"dist/index.js"}"#,
    )
    .unwrap();
    fs::write(remotes.join("dist/index.js"), "").unwrap();
    fs::write(
        remotes.join("dist/resolver.js"),
        "module.exports = (scope) => Promise.resolve(`file:///from-bit/${scope}`);",
    )
    .unwrap();
    let scope_json = json!({ "name": "local", "resolverPath": "../resolver.js" });
    let global = GlobalConfig::default();
    let resolver =
        Resolver::configured(&scope_json, PathBuf::new(), bit_dir, "local", &global).unwrap();
    let url = runtime()
        .block_on(resolver.resolve("remote"))
        .unwrap();
    assert_eq!(url, "file:///from-bit/remote");
}
