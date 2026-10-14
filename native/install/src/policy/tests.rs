use super::{
    DEPENDENCY_RESOLVER, VariantOptions, component_policy, entries,
    entries::{from_variant_config, merge},
    env::{from_config, merge_manifests},
    load::{is_core_env, load_env_policies, split_version},
    overrides::{self, field_index},
    scope::{Scope, is_hash, snap_to_semver},
    workspace_manifest, workspace_policy,
};
use crate::{
    config::DependencyResolverConfig,
    host::{AfterInstall, AfterInstallResult, Host},
    model::{ComponentId, EnvPolicy, Lifecycle, PolicyEntry, WorkspaceComponent},
};
use async_trait::async_trait;
use flate2::{Compression, write::ZlibEncoder};
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use std::{collections::HashMap, fs, io, io::Write, path::Path, sync::Mutex};

#[derive(Default)]
pub struct TestHost {
    pub policies: HashMap<String, Value>,
    pub calls: Mutex<Vec<String>>,
}

#[async_trait]
impl Host for TestHost {
    async fn env_policy(&self, env_id: &str) -> io::Result<Option<Value>> {
        self.calls
            .lock()
            .expect("calls")
            .push(env_id.to_owned());
        Ok(self.policies.get(env_id).cloned())
    }
    async fn app_types(&self) -> io::Result<Vec<String>> {
        Ok(Vec::new())
    }
    async fn package_json_props(&self, _component: &str) -> io::Result<Value> {
        Ok(Value::Null)
    }
    async fn transform_package_json(&self, _component: &str, manifest: Value) -> io::Result<Value> {
        Ok(manifest)
    }
    async fn after_install(&self, _request: AfterInstall) -> io::Result<AfterInstallResult> {
        Ok(AfterInstallResult::default())
    }
    async fn confirm(&self, _question: &str) -> io::Result<bool> {
        Ok(false)
    }
}

pub fn component(root: &Path, id: &str, env_id: &str) -> WorkspaceComponent {
    let (full, version) = split_version(id);
    let (scope, name) = full.split_once('/').expect("scope/name");
    WorkspaceComponent {
        id: ComponentId {
            scope: Some(scope.to_owned()),
            default_scope: None,
            name: name.to_owned(),
            version: version.map(str::to_owned),
        },
        root_dir: name.to_owned(),
        dir: root.join(name),
        files: Vec::new(),
        main_file: "index.ts".to_owned(),
        package_name: format!("@{scope}/{}", name.replace('/', ".")),
        env_id: env_id.to_owned(),
        is_env: false,
        has_package_json: false,
        config: serde_json::Map::new(),
    }
}

fn names(entries: &[PolicyEntry]) -> Vec<(String, String, Lifecycle)> {
    entries
        .iter()
        .map(|entry| (entry.name.clone(), entry.version.clone(), entry.lifecycle))
        .collect()
}

#[test]
fn workspace_policy_precedence() {
    let config = DependencyResolverConfig {
        policy: json!({"dependencies": {"a": "1.0.0", "c": {"version": "2.0.0", "preserve": true}}, "peerDependencies": {"react": "^18.0.0"}}),
        ..DependencyResolverConfig::default()
    };
    let package_json =
        json!({"dependencies": {"a": "2.0.0"}, "devDependencies": {"b": "1.0.0", "a": "0.1.0"}})
            .as_object()
            .cloned()
            .expect("object");
    let merge_config = json!({"dependencies": [{"name": "a", "version": "3.0.0"}]});
    let policy = workspace_policy(&config, Some(&package_json), Some(&merge_config));
    let find = |name: &str| {
        policy
            .iter()
            .find(|entry| entry.name == name)
            .expect(name)
            .clone()
    };
    assert_eq!(find("a").version, "3.0.0");
    assert_eq!(find("b").version, "1.0.0");
    assert_eq!(find("c").preserve, Some(true));
    assert_eq!(find("react").lifecycle, Lifecycle::Peer);
    assert_eq!(workspace_manifest(&policy)[1].get("react").map(String::as_str), Some("^18.0.0"));
}

#[test]
fn merge_keeps_last_policy_per_lifecycle() {
    let first = vec![
        entries::entry("a", "1", Lifecycle::Runtime),
        entries::entry("a", "1", Lifecycle::Peer),
    ];
    let second = vec![entries::entry("a", "2", Lifecycle::Runtime)];
    assert_eq!(
        names(&merge(vec![first, second])),
        vec![
            ("a".into(), "2".into(), Lifecycle::Runtime),
            ("a".into(), "1".into(), Lifecycle::Peer)
        ],
    );
}

#[test]
fn variant_config_object_and_array_forms() {
    let object = from_variant_config(
        &json!({"dependencies": {"a": "1.0.0", "b": "-"}}),
        &VariantOptions::default(),
    );
    assert!(object.iter().all(|entry| entry.force));
    let array = from_variant_config(
        &json!({"devDependencies": [{"name": "c", "version": "1.0.0", "optional": true}]}),
        &VariantOptions::default(),
    );
    assert_eq!(array[0].lifecycle, Lifecycle::Dev);
    assert!(!array[0].force);
    assert!(array[0].optional);
    assert_eq!(array[0].source.as_deref(), Some("config"));
}

#[test]
fn env_policy_from_env_jsonc() {
    let policy = from_config(
        &json!({
            "peers": [{"name": "react", "version": "18.2.0", "supportedRange": "^18.0.0", "override": true}],
            "dev": [{"name": "jest", "version": "29.0.0"}],
            "runtime": [{"name": "lodash", "version": "4.0.0", "force": true}],
            "dependencies": {"legacy": "1.0.0"},
        }),
        false,
    )
    .expect("policy");
    assert_eq!(
        names(&policy.self_policy),
        vec![("react".into(), "18.2.0".into(), Lifecycle::Runtime)],
    );
    assert!(policy.self_policy[0].force && policy.self_policy[0].r#override);
    let react = policy.component
        .iter()
        .find(|entry| entry.name == "react")
        .expect("react");
    assert_eq!(
        (react.version.as_str(), react.lifecycle, react.force),
        ("^18.0.0", Lifecycle::Peer, false),
    );
    assert!(
        policy.component
            .iter()
            .any(|entry| entry.name == "lodash" && entry.force),
    );
    assert!(
        policy.component
            .iter()
            .any(|entry| entry.name == "legacy" && entry.force),
    );
    assert!(from_config(&json!({"peers": [{"name": "x"}]}), false).is_err());
}

#[test]
fn core_env_legacy_peers_are_self_policy() {
    let policy =
        from_config(&json!({"peerDependencies": {"react": "^18.0.0"}}), true).expect("policy");
    assert_eq!(
        names(&policy.self_policy),
        vec![("react".into(), "^18.0.0".into(), Lifecycle::Runtime)],
    );
    assert_eq!(policy.self_policy[0].source.as_deref(), Some("env-own"));
    let not_core =
        from_config(&json!({"peerDependencies": {"react": "^18.0.0"}}), false).expect("policy");
    assert!(not_core.self_policy.is_empty());
}

#[test]
fn env_manifest_merge() {
    let parent = json!({"policy": {"peers": [{"name": "a", "version": "1"}, {"name": "b", "version": "1"}]}, "extends": "x/grand"});
    let child = json!({"policy": {"peers": [{"name": "b", "version": "-"}, {"name": "c", "version": "2"}]}, "extends": "x/parent"});
    let merged = merge_manifests(&parent, &child);
    assert_eq!(
        merged["policy"]["peers"],
        json!([{"name": "a", "version": "1"}, {"name": "c", "version": "2"}]),
    );
    assert_eq!(merged["extends"], "x/grand");
}

#[test]
fn overrides_views() {
    let mut forced = entries::entry("a", "1.0.0", Lifecycle::Runtime);
    forced.force = true;
    let mut forced_dev = entries::entry("a", "2.0.0", Lifecycle::Dev);
    forced_dev.force = true;
    let mut removed = entries::entry("b", "-", Lifecycle::Dev);
    removed.force = true;
    let auto = entries::entry("c", "^1.0.0", Lifecycle::Peer);
    let policy = vec![forced, forced_dev, removed, auto];
    let deps = overrides::deps(&policy);
    assert_eq!(deps[field_index(Lifecycle::Runtime)].get("a").map(String::as_str), Some("1.0.0"));
    assert!(!deps[field_index(Lifecycle::Dev)].contains_key("a"));
    assert_eq!(overrides::ignored(&deps, Lifecycle::Dev), vec!["b".to_owned()]);
    let auto_detect = overrides::auto_detect(&policy);
    assert_eq!(
        auto_detect[field_index(Lifecycle::Peer)].get("c").map(String::as_str),
        Some("^1.0.0"),
    );
}

#[test]
fn component_policy_merges_env_and_config() {
    let root = Path::new("/ws");
    let mut subject = component(root, "acme/ui@1.0.0", "acme/env");
    subject.config.insert(
        DEPENDENCY_RESOLVER.to_owned(),
        json!({"policy": {"dependencies": {"lodash": "4.1.0"}}}),
    );
    let env = EnvPolicy {
        component: vec![
            entries::entry("lodash", "4.0.0", Lifecycle::Runtime),
            entries::entry("react", "^18", Lifecycle::Peer),
        ],
        ..EnvPolicy::default()
    };
    let policy = component_policy(&subject, &env, None, &[]);
    let lodash = policy
        .iter()
        .find(|entry| entry.name == "lodash")
        .expect("lodash");
    assert_eq!(
        (lodash.version.as_str(), lodash.force, lodash.source.as_deref()),
        ("4.1.0", true, Some("config")),
    );
    assert!(
        policy
            .iter()
            .any(|entry| entry.name == "react"),
    );
}

#[test]
fn ids_and_versions() {
    assert_eq!(split_version("acme/env@1.0.0"), ("acme/env", Some("1.0.0")));
    assert_eq!(split_version("acme/env"), ("acme/env", None));
    assert!(is_core_env("teambit.harmony/node"));
    assert!(is_core_env("teambit.react/react@1.0.0"));
    assert!(!is_core_env("teambit.react/react-env"));
    assert!(is_hash("abc"));
    assert!(!is_hash("1.0.0"));
    assert_eq!(snap_to_semver(&"a".repeat(40)), format!("0.0.0-{}", "a".repeat(40)));
    assert_eq!(snap_to_semver("^1.0.0"), "^1.0.0");
}

#[tokio::test]
async fn env_policies_from_workspace_envs_host_and_scope() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let mut base = component(root, "acme/envs/base", "teambit.envs/env");
    base.files = vec!["env.jsonc".into()];
    let mut child = component(root, "acme/envs/child", "teambit.envs/env");
    child.files = vec!["env.jsonc".into()];
    write(
        &base.dir.join("env.jsonc"),
        r#"{ "policy": { "peers": [{ "name": "react", "version": "18.0.0", "supportedRange": "^18" }], }, } // base"#,
    );
    write(
        &child.dir.join("env.jsonc"),
        r#"{ "extends": "acme/envs/base", "policy": { "dev": [{ "name": "jest", "version": "29.0.0" }] } }"#,
    );
    let user = |env: &str| component(root, "acme/ui", env);
    let components = vec![
        user("acme/envs/child"),
        user("teambit.harmony/node"),
        user("acme/legacy-env@1.0.0"),
        user("acme/scoped-env@2.0.0"),
        base,
        child,
    ];
    store_env(
        root,
        "acme/scoped-env",
        "2.0.0",
        r#"{"policy":{"runtime":[{"name":"scoped","version":"1.0.0"}]}}"#,
    );
    let host = TestHost {
        policies: HashMap::from([
            (
                "teambit.harmony/node".to_owned(),
                json!({"peerDependencies": {"typescript": "5.9.2"}}),
            ),
            ("acme/legacy-env@1.0.0".to_owned(), json!({"dependencies": {"legacy": "1.0.0"}})),
        ]),
        ..TestHost::default()
    };
    let policies = load_env_policies(root, &components, &host).await.expect("policies");
    let child_policy = &policies["acme/envs/child"];
    assert!(
        child_policy.component
            .iter()
            .any(|entry| entry.name == "jest"),
    );
    assert!(
        child_policy.self_policy
            .iter()
            .any(|entry| entry.name == "react"),
    );
    assert!(!child_policy.without_manifest);
    assert_eq!(policies["teambit.harmony/node"].self_policy[0].name, "typescript");
    assert!(policies["acme/legacy-env@1.0.0"].without_manifest);
    assert!(
        policies["acme/scoped-env@2.0.0"].component
            .iter()
            .any(|entry| entry.name == "scoped"),
    );
    assert_eq!(policies["teambit.envs/env"], EnvPolicy::default());
}

fn write(path: &Path, contents: &str) {
    fs::create_dir_all(path.parent().expect("parent")).expect("dir");
    fs::write(path, contents).expect("write");
}

fn hex(bytes: &[u8]) -> String {
    super::scope::hex_sha1(bytes)
}

/// Write a loose scope object and return its hash.
pub fn store_object(root: &Path, kind: &str, hash: Option<String>, body: &[u8]) -> String {
    let hash = hash.unwrap_or_else(|| hex(body));
    let mut contents = format!("{kind} {hash} {}\0", body.len()).into_bytes();
    contents.extend_from_slice(body);
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&contents).expect("compress");
    let path = root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().expect("parent")).expect("dir");
    fs::write(path, encoder.finish().expect("finish")).expect("write");
    hash
}

/// Store a component model with one tagged version holding `env.jsonc`.
pub fn store_env(root: &Path, id: &str, tag: &str, env_jsonc: &str) -> String {
    let source = store_object(root, "Source", None, env_jsonc.as_bytes());
    let version =
        json!({"files": [{"relativePath": "env.jsonc", "file": source, "name": "env.jsonc"}]});
    store_version(root, id, tag, &version)
}

/// Store a component model with one tagged version.
pub fn store_version(root: &Path, id: &str, tag: &str, version: &Value) -> String {
    let version = store_object(root, "Version", None, version.to_string().as_bytes());
    let (scope, name) = id.split_once('/').expect("id");
    let model = json!({"scope": scope, "name": name, "versions": {tag: version}, "head": version});
    store_object(root, "Component", Some(hex(id.as_bytes())), model.to_string().as_bytes());
    version
}

#[test]
fn scope_reads_versions_and_files() {
    let temp = tempfile::tempdir().expect("tempdir");
    store_env(temp.path(), "acme/env", "1.0.0", "{}");
    let scope = Scope::find(temp.path()).expect("scope");
    let tagged = scope
        .version("acme/env", Some("1.0.0"))
        .expect("read")
        .expect("version");
    assert_eq!(scope.file(&tagged, "env.jsonc").expect("file"), Some(b"{}".to_vec()));
    assert!(
        scope
            .version("acme/env", None)
            .expect("head")
            .is_some(),
    );
    assert!(
        scope
            .version("acme/env", Some("2.0.0"))
            .expect("missing tag")
            .is_none(),
    );
    assert!(
        scope
            .version("acme/other", None)
            .expect("missing model")
            .is_none(),
    );
}
