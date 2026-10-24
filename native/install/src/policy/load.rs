//! Env policies of the envs workspace components use (`getComponentEnvPolicy`).
//!
//! A core env's policy comes from its `getDependencies()` through the host. Any
//! other env is read from its `env.jsonc`: from the component directory when the
//! env is a workspace component, otherwise from the env's `Version` in the scope
//! objects (the pre-install import fetches it). `extends` is resolved the same way.
//! An env without `env.jsonc` falls back to `getDependencies()` and is marked
//! `without_manifest`.

use super::{env, scope::Scope};
use crate::{
    host::Host,
    model::{EnvPolicy, WorkspaceComponent},
};
use indexmap::IndexMap;
use serde_json::Value;
use std::{fs, io, path::Path};

/// `getCoreEnvsIds()`.
pub const CORE_ENVS: [&str; 10] = [
    "teambit.harmony/aspect",
    "teambit.react/react",
    "teambit.harmony/node",
    "teambit.react/react-native",
    "teambit.html/html",
    "teambit.mdx/mdx",
    "teambit.envs/env",
    "teambit.mdx/readme",
    "teambit.harmony/bit-custom-aspect",
    "teambit.harmony/empty-env",
];

const MAX_EXTENDS: usize = 16;

/// Whether `id` (with or without a version) is a core env.
#[must_use]
pub fn is_core_env(id: &str) -> bool {
    CORE_ENVS.contains(&split_version(id).0)
}

/// `scope/name@version` → (`scope/name`, `version`).
#[must_use]
pub fn split_version(id: &str) -> (&str, Option<&str>) {
    match id.rfind('@') {
        Some(index) if index > 0 => (&id[..index], Some(&id[index + 1..])),
        _ => (id, None),
    }
}

/// The policy of every env used by `components`, keyed by the env id as written
/// in [`WorkspaceComponent::env_id`].
pub async fn load_env_policies(
    root: &Path,
    components: &[WorkspaceComponent],
    host: &dyn Host,
) -> io::Result<IndexMap<String, EnvPolicy>> {
    let reader = EnvJsoncReader { components, scope: Scope::find(root) };
    let mut policies = IndexMap::new();
    for component in components {
        if policies.contains_key(&component.env_id) {
            continue;
        }
        let policy = env_policy(&reader, &component.env_id, host).await?;
        policies.insert(component.env_id.clone(), policy);
    }
    Ok(policies)
}

/// The policy of one env.
pub async fn env_policy(
    reader: &EnvJsoncReader<'_>,
    env_id: &str,
    host: &dyn Host,
) -> io::Result<EnvPolicy> {
    if is_core_env(env_id) {
        let config = host.env_policy(split_version(env_id).0).await?;
        return config.map_or_else(
            || Ok(EnvPolicy::default()),
            |config| env::from_config(&config, true),
        );
    }
    if let Some(manifest) = reader.resolved(env_id)? {
        let policy = manifest
            .get("policy")
            .cloned()
            .unwrap_or(Value::Null);
        return if policy.is_object() {
            env::from_config(&policy, false)
        } else {
            Ok(EnvPolicy::default())
        };
    }
    let default_env = host.env_falls_back(env_id).await?;
    let config = host.env_policy(env_id).await?;
    let failed_to_load = default_env || config.is_none();
    let mut policy =
        config.map_or_else(|| Ok(EnvPolicy::default()), |config| env::from_config(&config, false))?;
    policy.without_manifest = true;
    policy.failed_to_load = failed_to_load;
    policy.default_env = default_env;
    Ok(policy)
}

/// Finds and resolves `env.jsonc` files.
pub struct EnvJsoncReader<'a> {
    pub components: &'a [WorkspaceComponent],
    pub scope: Option<Scope>,
}

impl EnvJsoncReader<'_> {
    /// The `env.jsonc` of `env_id` with its `extends` chain merged in.
    pub fn resolved(&self, env_id: &str) -> io::Result<Option<Value>> {
        self.resolve(env_id, None, 0)
    }

    fn resolve(
        &self,
        env_id: &str,
        dependent: Option<&Value>,
        depth: usize,
    ) -> io::Result<Option<Value>> {
        if depth > MAX_EXTENDS {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("env.jsonc extends cycle at {env_id}"),
            ));
        }
        let Some((manifest, version)) = self.read(env_id, dependent)? else { return Ok(None) };
        let Some(parent) = manifest.get("extends").and_then(Value::as_str) else {
            return Ok(Some(manifest));
        };
        // A core env parent contributes nothing (`resolveEnvManifest` returns `{}`).
        let parent_manifest = if is_core_env(parent) {
            Value::Object(serde_json::Map::new())
        } else {
            self.resolve(parent, version.as_ref(), depth + 1)?
                .unwrap_or_else(|| Value::Object(serde_json::Map::new()))
        };
        let mut merged = env::merge_manifests(&parent_manifest, &manifest);
        if let Some(object) = merged.as_object_mut() {
            object.remove("extends");
        }
        Ok(Some(merged))
    }

    /// The raw `env.jsonc` of an env, with the `Version` object it came from (scope only).
    fn read(
        &self,
        env_id: &str,
        dependent: Option<&Value>,
    ) -> io::Result<Option<(Value, Option<Value>)>> {
        let (id, version) = split_version(env_id);
        if let Some(component) = self.components
            .iter()
            .find(|component| component.id.to_string_without_version() == id)
        {
            return read_dir(&component.dir)
                .map(|manifest| manifest.map(|manifest| (manifest, None)));
        }
        let Some(scope) = &self.scope else { return Ok(None) };
        let version = version.map(str::to_owned).or_else(|| dependency_version(dependent, id));
        let Some(object) = scope.version(id, version.as_deref())? else { return Ok(None) };
        let Some(bytes) = scope
            .file(&object, "env.jsonc")?
            .map_or_else(|| scope.file(&object, "env.json"), |bytes| Ok(Some(bytes)))?
        else {
            return Ok(None);
        };
        Ok(Some((parse(&bytes, env_id)?, Some(object))))
    }
}

/// The version a dependent env's `Version` records for its parent env.
fn dependency_version(dependent: Option<&Value>, id: &str) -> Option<String> {
    let dependent = dependent?;
    ["dependencies", "devDependencies", "peerDependencies"]
        .iter()
        .filter_map(|field| dependent[field].as_array())
        .flatten()
        .find(|dependency| {
            let scope = dependency["id"]["scope"].as_str().unwrap_or_default();
            let name = dependency["id"]["name"].as_str().unwrap_or_default();
            format!("{scope}/{name}") == id
        })
        .and_then(|dependency| dependency["id"]["version"].as_str())
        .map(str::to_owned)
}

fn read_dir(dir: &Path) -> io::Result<Option<Value>> {
    for name in ["env.jsonc", "env.json"] {
        match fs::read(dir.join(name)) {
            Ok(bytes) => return parse(&bytes, &dir.display().to_string()).map(Some),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(None)
}

fn parse(bytes: &[u8], location: &str) -> io::Result<Value> {
    bit_object_import::parse_jsonc(bytes).map_err(|error| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Syntax error in env.jsonc for {location}: {error}. Please check the file for invalid JSONC syntax."),
        )
    })
}
