use super::{Registration, candidates, component_slots, registry};
use crate::{
    host::{AfterInstall, AfterInstallResult, CoreAspect, Host},
    model::{Lifecycle, WorkspaceComponent},
    policy::{DEPENDENCY_RESOLVER, component_policy, entries::entry, tests::component},
};
use async_trait::async_trait;
use serde_json::{Value, json};
use std::{io, path::Path, sync::Mutex};

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

#[test]
fn only_non_core_aspects_other_than_the_env_are_candidates() {
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
    let core = [CoreAspect {
        id: "teambit.dependencies/dependency-resolver".to_owned(),
        package_name: "@teambit/dependency-resolver".to_owned(),
        dir: "/bit/dependency-resolver".into(),
    }];
    assert_eq!(candidates(&[subject], &core), ["my-scope/extension-add-dependencies"]);
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
    let plain = configured("my-scope/utils/is-type", &["teambit.harmony/node"]);
    assert!(registry(std::slice::from_ref(&plain), &[], &host).await.unwrap().is_empty());
    assert!(host.asked.lock().unwrap().is_empty());
    let bar = configured("my-scope/bar/foo", &["my-scope/extension-add-dependencies"]);
    let registered = registry(&[plain, bar], &[], &host).await.unwrap();
    assert_eq!(registered, [registration()]);
    assert_eq!(*host.asked.lock().unwrap(), ["my-scope/extension-add-dependencies"]);
}
