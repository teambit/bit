use super::{Registration, candidates, component_slots, registry};
use crate::{
    host::{AfterInstall, AfterInstallResult, CoreAspect, Host},
    model::{Lifecycle, WorkspaceComponent},
    policy::{DEPENDENCY_RESOLVER, component_policy, entries::entry, tests::component},
    workspace::{ScopeObjects, sha1_hex},
};
use async_trait::async_trait;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{fs, io, io::Write, path::Path, sync::Mutex};

fn write_object(scope: &Path, hash: &str, kind: &str, body: &Value) {
    let body = body.to_string();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(format!("{kind} {hash} {}\0{body}", body.len()).as_bytes())
        .unwrap();
    let dir = scope.join("objects").join(&hash[..2]);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join(&hash[2..]), encoder.finish().unwrap()).unwrap();
}

/// The e2e fixture `extension-add-dependencies`: an aspect that registers a policy.
fn registration() -> Registration {
    (
        "my-scope/extension-add-dependencies".to_owned(),
        json!({
            "dependencies": { "lodash.get": "4.0.0" },
            "devDependencies": { "lodash.words": "4.0.0" },
            "peerDependencies": { "lodash.set": "4.0.0" },
        }),
    )
}

fn configured(id: &str, extensions: &[&str]) -> WorkspaceComponent {
    let mut subject = component(Path::new("/ws"), id, "teambit.harmony/node");
    for extension in extensions {
        subject.config.insert((*extension).to_owned(), json!({}));
    }
    subject
}

#[test]
fn applies_the_registered_policy_only_to_components_configuring_the_aspect() {
    let bar = configured("my-scope/bar/foo", &["my-scope/extension-add-dependencies"]);
    let utils = configured("my-scope/utils/is-type", &[]);
    let slots = component_slots(&bar, &[registration()]);
    let names: Vec<_> = slots
        .iter()
        .map(|entry| (entry.name.as_str(), entry.lifecycle, entry.source.as_deref(), entry.force))
        .collect();
    assert_eq!(
        names,
        [
            ("lodash.set", Lifecycle::Peer, Some("slots"), true),
            ("lodash.words", Lifecycle::Dev, Some("slots"), true),
            ("lodash.get", Lifecycle::Runtime, Some("slots"), true),
        ],
    );
    assert!(component_slots(&utils, &[registration()]).is_empty());
}

#[test]
fn a_registrar_containing_the_configured_id_matches() {
    let subject = configured("my-scope/bar/foo", &["my-scope/extension-add"]);
    assert_eq!(component_slots(&subject, &[registration()]).len(), 3);
}

#[test]
fn config_policy_wins_over_slots_and_slots_over_the_env() {
    let mut subject = configured("my-scope/bar/foo", &["my-scope/extension-add-dependencies"]);
    subject.config.insert(
        DEPENDENCY_RESOLVER.to_owned(),
        json!({ "policy": { "dependencies": { "lodash.get": "4.1.0" } } }),
    );
    let env = crate::model::EnvPolicy {
        component: vec![entry("lodash.words", "3.0.0", Lifecycle::Dev)],
        ..crate::model::EnvPolicy::default()
    };
    let policy = component_policy(&subject, &env, None, &[registration()]);
    let version = |name: &str| {
        policy
            .iter()
            .find(|entry| entry.name == name)
            .map(|entry| entry.version.clone())
    };
    assert_eq!(version("lodash.get").as_deref(), Some("4.1.0"));
    assert_eq!(version("lodash.words").as_deref(), Some("4.0.0"));
}

/// A scope without objects: nothing is known about envs outside the workspace.
fn empty_scope() -> (tempfile::TempDir, ScopeObjects) {
    let dir = tempfile::tempdir().unwrap();
    let objects = ScopeObjects::new(dir.path());
    (dir, objects)
}

#[test]
fn only_non_core_aspects_and_non_plugin_envs_are_candidates() {
    let mut subject = configured(
        "my-scope/bar/foo",
        &[
            "my-scope/extension-add-dependencies",
            "teambit.harmony/node",
            "teambit.dependencies/dependency-resolver",
            "teambit.harmony/bit",
            "acme/envs/my-env@1.0.0",
        ],
    );
    subject.env_id = "acme/envs/my-env@1.0.0".to_owned();
    let env = component(Path::new("/ws"), "acme/envs/my-env", "teambit.envs/env");
    let core = [CoreAspect {
        id: "teambit.dependencies/dependency-resolver".to_owned(),
        package_name: "@teambit/dependency-resolver".to_owned(),
        dir: "/bit/dependency-resolver".into(),
    }];
    let (_scope, objects) = empty_scope();
    assert_eq!(
        candidates(&[subject, env], &core, &objects).unwrap(),
        ["my-scope/extension-add-dependencies"],
    );
}

/// An env aspect (its own env is an aspect env) runs a provider, which may register
/// a policy; an env plugin (its own env is `teambit.envs/env`) does not.
#[test]
fn an_env_aspect_is_a_candidate_and_an_env_plugin_is_not() {
    let root = Path::new("/ws");
    let mut aspect_user = configured("acme/ui/button", &["acme/envs/aspect-env"]);
    aspect_user.env_id = "acme/envs/aspect-env".to_owned();
    let aspect_env = component(root, "acme/envs/aspect-env", "teambit.harmony/aspect");
    let mut plugin_user = configured("acme/ui/card", &["acme/envs/plugin-env"]);
    plugin_user.env_id = "acme/envs/plugin-env".to_owned();
    let plugin_env = component(root, "acme/envs/plugin-env", "teambit.envs/env");
    let (_scope, objects) = empty_scope();
    assert_eq!(
        candidates(&[aspect_user, aspect_env, plugin_user, plugin_env], &[], &objects).unwrap(),
        ["acme/envs/aspect-env"],
    );
}

/// An env outside the workspace is classified by the Version the scope holds; one the
/// scope does not hold is loaded to find out.
#[test]
fn an_external_env_is_classified_by_its_scope_objects() {
    let scope = tempfile::tempdir().unwrap();
    for (name, env) in
        [("plugin-env", "teambit.envs/env"), ("aspect-env", "teambit.harmony/aspect")]
    {
        let version_hash = sha1_hex(name);
        write_object(
            scope.path(),
            &sha1_hex(&format!("org.remote/envs/{name}")),
            "Component",
            &json!({ "name": format!("envs/{name}"), "scope": "org.remote", "versions": { "1.0.0": version_hash } }),
        );
        write_object(
            scope.path(),
            &version_hash,
            "Version",
            &json!({ "extensions": [{ "name": "teambit.envs/envs", "config": { "env": env }, "data": {} }] }),
        );
    }
    let user = |name: &str, env: &str| {
        let mut subject = configured(name, &[env]);
        subject.env_id = env.to_owned();
        subject
    };
    let components = [
        user("acme/ui/a", "org.remote/envs/plugin-env@1.0.0"),
        user("acme/ui/b", "org.remote/envs/aspect-env@1.0.0"),
        user("acme/ui/c", "org.remote/envs/missing-env@1.0.0"),
        user("acme/ui/d", "teambit.react/react"),
    ];
    assert_eq!(
        candidates(&components, &[], &ScopeObjects::new(scope.path())).unwrap(),
        ["org.remote/envs/aspect-env@1.0.0", "org.remote/envs/missing-env@1.0.0"],
    );
}

/// What an env aspect registers in its provider applies to the components that
/// configure the env (`policyRegistrar.includes(extId)`).
#[test]
fn the_policy_an_env_registers_applies_to_its_components() {
    let mut subject = configured("acme/ui/button", &["acme/envs/aspect-env"]);
    subject.env_id = "acme/envs/aspect-env".to_owned();
    let registry = [(
        "acme/envs/aspect-env@0.0.1".to_owned(),
        json!({ "peerDependencies": { "react": "^18.0.0" } }),
    )];
    let names: Vec<_> = component_slots(&subject, &registry)
        .into_iter()
        .map(|entry| (entry.name, entry.lifecycle))
        .collect();
    assert_eq!(names, [("react".to_owned(), Lifecycle::Peer)]);
}

/// A host that records the ids it is asked to load.
struct Recording {
    asked: Mutex<Vec<String>>,
}

#[async_trait]
impl Host for Recording {
    async fn env_policy(&self, _: &str) -> io::Result<Option<Value>> {
        Ok(None)
    }

    async fn app_types(&self) -> io::Result<Vec<String>> {
        Ok(Vec::new())
    }

    async fn package_json_props(&self, _: &str) -> io::Result<Value> {
        Ok(json!({}))
    }

    async fn transform_package_json(&self, _: &str, manifest: Value) -> io::Result<Value> {
        Ok(manifest)
    }

    async fn after_install(&self, _: AfterInstall) -> io::Result<AfterInstallResult> {
        Ok(AfterInstallResult::default())
    }

    async fn confirm(&self, _: &str) -> io::Result<bool> {
        Ok(false)
    }

    async fn dependency_policies(&self, extension_ids: &[String]) -> io::Result<Option<Value>> {
        self.asked
            .lock()
            .unwrap()
            .extend_from_slice(extension_ids);
        let (registrar, policy) = registration();
        Ok(Some(json!([[registrar, policy], ["broken"]])))
    }
}

#[tokio::test]
async fn the_host_is_asked_only_when_a_component_configures_a_candidate() {
    let host = Recording { asked: Mutex::new(Vec::new()) };
    let (_scope, objects) = empty_scope();
    let plain = configured("my-scope/utils/is-type", &["teambit.harmony/node"]);
    assert!(registry(std::slice::from_ref(&plain), &[], &objects, &host).await.unwrap().is_empty());
    assert!(host.asked.lock().unwrap().is_empty());
    let bar = configured("my-scope/bar/foo", &["my-scope/extension-add-dependencies"]);
    let registered = registry(&[plain, bar], &[], &objects, &host).await.unwrap();
    assert_eq!(registered, [registration()]);
    assert_eq!(*host.asked.lock().unwrap(), ["my-scope/extension-add-dependencies"]);
}
