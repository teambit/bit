use super::{
    DependencyResolverConfig, EffectiveConfig, MergeConfig, ScopeJson, WorkspaceConfig,
    aspect_id_without_version, keys, load_global_config, scope_path,
};
use crate::model::GlobalConfig;
use indexmap::IndexMap;
use pretty_assertions::assert_eq;
use serde_json::json;
use std::fs;
use tempfile::tempdir;

const WORKSPACE: &str = r#"/**
 * header
 **/
{
  "$schema": "https://static.bit.dev/teambit/schemas/schema.json",
  "teambit.workspace/workspace": {
    "name": "my-ws",
    "defaultScope": "org.scope",
    "defaultDirectory": "{scope}/{name}",
    "ignoredFiles": ["*.bak"],
    "trackAllFiles": true,
    "somethingNew": 1,
  },
  // dependency resolution
  "teambit.dependencies/dependency-resolver": {
    "policy": { "dependencies": { "lodash": "^4.0.0" }, "peerDependencies": {} },
    "rootComponents": true,
    "strictSsl": "false",
    "allowScripts": { "esbuild": true, "core-js": "warn" },
  },
  "teambit.workspace/variants": {
    "*": { "teambit.envs/envs": { "env": "teambit.react/react" } },
    "{ui/*}": { "propagate": false },
    "invalid": "-",
  },
  "teambit.generator/generator": { "envs": ["bitdev.node/node-env", 3] },
  "teambit.workspace/workspace-config-files": { "enableWorkspaceConfigWrite": true },
  "teambit.harmony/config-store": { "registry": "https://reg", "x": true },
  "my-org.my-scope/my-aspect@1.0.0": {},
  "teambit.react/react": {},
  "file:/tmp/aspect": {},
}"#;

#[test]
fn loads_workspace_jsonc() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("workspace.jsonc"), WORKSPACE).unwrap();
    let config = WorkspaceConfig::load(dir.path()).unwrap();
    assert!(!config.aspects.contains_key("$schema"));
    assert_eq!(config.aspects.len(), 9);
    assert_eq!(config.workspace.name.as_deref(), Some("my-ws"));
    assert_eq!(config.workspace.default_scope.as_deref(), Some("org.scope"));
    assert_eq!(config.workspace.ignored_files.as_deref(), Some(&["*.bak".to_owned()][..]));
    assert_eq!(config.workspace.track_all_files, Some(true));
    assert_eq!(config.workspace.rest["somethingNew"], json!(1));
    assert!(config.dependency_resolver.has_root_components());
    assert_eq!(config.dependency_resolver.strict_ssl, Some(json!("false")));
    assert_eq!(config.dependency_resolver.policy["dependencies"]["lodash"], json!("^4.0.0"));
    let patterns: Vec<_> = config.variants
        .iter()
        .map(|(pattern, _)| pattern.as_str())
        .collect();
    assert_eq!(patterns, ["*", "{ui/*}"]);
    assert_eq!(config.generator_envs, ["bitdev.node/node-env"]);
    assert!(config.enable_workspace_config_write);
    assert_eq!(config.config_store["registry"], "https://reg");
    assert_eq!(config.config_store["x"], "true");
    let core = vec!["teambit.workspace/workspace".to_owned(), "teambit.react/react".to_owned()];
    let user = config.user_aspect_ids(&core);
    assert!(user.contains(&"my-org.my-scope/my-aspect@1.0.0".to_owned()));
    assert!(
        !user
            .iter()
            .any(|id| id.starts_with("file:") || id == "teambit.react/react"),
    );
    assert!(config.aspect("my-org.my-scope/my-aspect").is_some());
    assert_eq!(config.root_components_path(dir.path()), dir.path().join("node_modules/.bit_roots"));
}

#[test]
fn missing_or_invalid_workspace_jsonc_fails() {
    let dir = tempdir().unwrap();
    assert_eq!(WorkspaceConfig::load(dir.path()).unwrap_err().kind(), std::io::ErrorKind::NotFound);
    fs::write(dir.path().join("workspace.jsonc"), "{ nope }").unwrap();
    assert_eq!(
        WorkspaceConfig::load(dir.path()).unwrap_err().kind(),
        std::io::ErrorKind::InvalidData,
    );
}

#[test]
fn aspect_ids_without_version() {
    assert_eq!(aspect_id_without_version("teambit.react/react@1.2.3"), "teambit.react/react");
    assert_eq!(aspect_id_without_version("teambit.react/react"), "teambit.react/react");
}

#[test]
fn dependency_resolver_defaults() {
    let config = DependencyResolverConfig::default();
    assert_eq!(config.node_linker(), "isolated");
    assert!(config.link_core_aspects());
    let yarn = DependencyResolverConfig {
        package_manager: Some("teambit.dependencies/yarn".to_owned()),
        ..DependencyResolverConfig::default()
    };
    assert_eq!(yarn.node_linker(), "hoisted");
}

#[test]
fn global_config_layers() {
    let dir = tempdir().unwrap();
    assert!(load_global_config(dir.path()).unwrap().is_empty());
    fs::write(dir.path().join("config.json"), r#"{"user.token":"t","registry":"g","n":5}"#)
        .unwrap();
    let global: GlobalConfig = load_global_config(dir.path()).unwrap();
    let scope: IndexMap<String, String> =
        std::iter::once(("registry".to_owned(), "s".to_owned())).collect();
    let workspace: IndexMap<String, String> =
        std::iter::once(("cloud_domain".to_owned(), "w".to_owned())).collect();
    let config = EffectiveConfig::new(&global, &scope, &workspace);
    assert_eq!(config.get(keys::USER_TOKEN).as_deref(), Some("t"));
    assert_eq!(config.get(keys::REGISTRY_URL).as_deref(), Some("s"));
    assert_eq!(config.cloud_domain(), "w");
    assert_eq!(config.get_number("n").unwrap(), Some(5.0));
    assert!(config.get_bool("registry").is_err());
    assert_eq!(
        EffectiveConfig::env_variable_name("network.fetch_retries"),
        "BIT_CONFIG_NETWORK_FETCH_RETRIES",
    );
    assert_eq!(EffectiveConfig::default().cloud_domain(), "bit.cloud");
}

#[test]
fn scope_path_prefers_dot_bit_over_git() {
    let dir = tempdir().unwrap();
    assert_eq!(scope_path(dir.path()), dir.path().join(".bit"));
    fs::create_dir(dir.path().join(".git")).unwrap();
    assert_eq!(scope_path(dir.path()), dir.path().join(".git/bit"));
    fs::create_dir(dir.path().join(".bit")).unwrap();
    assert_eq!(scope_path(dir.path()), dir.path().join(".bit"));
    let worktree = tempdir().unwrap();
    fs::write(worktree.path().join(".git"), "gitdir: elsewhere").unwrap();
    assert_eq!(scope_path(worktree.path()), worktree.path().join(".bit"));
}

#[test]
fn reads_scope_json() {
    let dir = tempdir().unwrap();
    assert_eq!(ScopeJson::load(dir.path()).unwrap(), ScopeJson::default());
    fs::write(
        dir.path().join("scope.json"),
        r#"{"name":"local","remotes":{"r":"http://r"},"lanes":{"tracking":[{"localLane":"dev","remoteLane":"dev","remoteScope":"org.s"}],"new":[]},"config":{"a":"b","n":1}}"#,
    )
    .unwrap();
    let scope = ScopeJson::load(dir.path()).unwrap();
    assert_eq!(scope.remotes["r"], "http://r");
    assert_eq!(scope.tracking("dev").map(|lane| lane.remote_scope.as_str()), Some("org.s"));
    assert_eq!(scope.config["n"], "1");
}

#[test]
fn merge_config_entries() {
    let text = format!(
        "# Resolve configuration conflicts per component and make sure the Component ID remain in place\n\n{d}\n[*] org.s/comp\n{d}\n{body}\n\n{d}\n[*] WORKSPACE\n{d}\n{ws}\n\n{d}\n[*] org.s/conflicted\n{d}\n<<<<<<< ours\n{{}}\n",
        d = "-".repeat(80),
        body = r#"{"teambit.envs/envs":{"env":"org.s/env@1.0.0"},"teambit.dependencies/dependency-resolver":{"policy":{"dependencies":[{"name":"a","version":"1","force":true},{"name":"b","version":"2","force":false}]}}}"#,
        ws = r#"{"teambit.dependencies/dependency-resolver":{"policy":{"dependencies":[{"name":"x","version":"^1"}]}}}"#,
    );
    let config = MergeConfig::parse(&text);
    let component = config
        .component("org.s/comp")
        .unwrap()
        .unwrap();
    assert_eq!(component.config["teambit.envs/envs"], json!({ "env": "org.s/env" }));
    assert_eq!(component.config["org.s/env@1.0.0"], json!({}));
    assert_eq!(
        component.config["teambit.dependencies/dependency-resolver"],
        json!({ "policy": { "dependencies": { "a": "1" } } }),
    );
    assert_eq!(
        component.auto_deps["dependencies"],
        json!([{ "name": "b", "version": "2", "force": false }]),
    );
    assert_eq!(
        config
            .workspace_policy()
            .unwrap()
            .unwrap()["dependencies"],
        json!({ "x": "^1" }),
    );
    assert!(
        config
            .component("org.s/conflicted")
            .unwrap()
            .is_none(),
    );
    assert!(
        config
            .component("org.s/missing")
            .unwrap()
            .is_none(),
    );
    assert!(MergeConfig::parse("[*] a\nnot json").component("a").is_err());
}

#[test]
fn merge_config_load_combines_unmerged_json() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join(".bit")).unwrap();
    fs::write(
        dir.path().join(".bit/unmerged.json"),
        serde_json::to_string(&json!([
            {
                "id": { "scope": "org.s", "name": "comp" },
                "mergedConfig": {
                    "teambit.dependencies/dependency-resolver": {
                        "policy": {
                            "dependencies": [{ "name": "is-positive", "version": "3.1.0", "force": false }]
                        }
                    }
                }
            }
        ]))
        .unwrap(),
    )
    .unwrap();
    let config = MergeConfig::load(dir.path()).unwrap();
    assert!(!config.is_empty());
    let component = config
        .component("org.s/comp")
        .unwrap()
        .unwrap();
    assert_eq!(
        component.auto_deps["dependencies"],
        json!([{ "name": "is-positive", "version": "3.1.0", "force": false }]),
    );
}

#[test]
fn effective_layer_order_filters_unsupported_globals_before_scope_overrides() {
    let global = GlobalConfig::from_iter([
        ("first".to_owned(), json!(["unsupported"])),
        ("last".to_owned(), json!("retained")),
    ]);
    let scope = IndexMap::from_iter([("first".to_owned(), "scope".to_owned())]);
    let config = EffectiveConfig::new(&global, &scope, &IndexMap::new());
    assert_eq!(
        config
            .merged()
            .keys()
            .take(2)
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["last", "first"],
    );
}
