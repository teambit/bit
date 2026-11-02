//! `EnvPolicy.fromConfigObject` and the `env.jsonc` `extends` merge (`mergeEnvManifestPolicy`).
//!
//! Parses `peers`, `components`, and legacy dependency sections from `env.jsonc` manifests via [`from_config`].

use super::entries::{self, VariantOptions, from_variant_config, merge, truthy, uniq};
use crate::model::{EnvPolicy, Lifecycle, PolicyEntry};
use serde_json::{Map, Value, json};
use std::io;

/// Options controlling version key, lifecycle, source, and `force` flag in `entriesFromKey`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct KeyOptions {
    version_key: &'static str,
    lifecycle: Lifecycle,
    source: &'static str,
    force: Option<bool>,
}

/// Convert an `EnvPolicyConfigObject` (the `policy` of `env.jsonc`, or what an env's
/// `getDependencies()` returns) to an [`EnvPolicy`].
pub fn from_config(config: &Value, include_legacy_peers: bool) -> io::Result<EnvPolicy> {
    let self_policy = if include_legacy_peers
        && config.get("peers").is_none()
        && config.get("peerDependencies").is_some()
    {
        legacy_peers(config)
    } else {
        let options = KeyOptions {
            version_key: "version",
            lifecycle: Lifecycle::Runtime,
            source: "env-own",
            force: Some(true),
        };
        from_key(config, "peers", &options)?
    };
    let legacy = from_variant_config(
        config,
        &VariantOptions { source: Some("env"), force: Some(true), hidden: Some(false) },
    );
    let peers = KeyOptions {
        version_key: "supportedRange",
        lifecycle: Lifecycle::Peer,
        source: "env",
        force: None,
    };
    let mut new_entries = from_key(config, "peers", &peers)?;
    for (key, lifecycle) in [("dev", Lifecycle::Dev), ("runtime", Lifecycle::Runtime)] {
        let options = KeyOptions { version_key: "version", lifecycle, source: "env", force: None };
        new_entries.extend(from_key(config, key, &options)?);
    }
    Ok(EnvPolicy {
        component: merge(vec![legacy, uniq(new_entries)]),
        self_policy: uniq(self_policy),
        without_manifest: false,
        failed_to_load: false,
        default_env: false,
    })
}

/// Parse legacy `peerDependencies` from `config` as forced `"env-own"` runtime [`PolicyEntry`] items.
fn legacy_peers(config: &Value) -> Vec<PolicyEntry> {
    let Some(peers) = config.get("peerDependencies").and_then(Value::as_object) else {
        return Vec::new();
    };
    peers
        .iter()
        .filter_map(|(name, value)| {
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            let created = entries::value_entry(name, value, Lifecycle::Runtime)?;
            Some(PolicyEntry {
                force: true,
                hidden: false,
                source: Some("env-own".to_owned()),
                ..created
            })
        })
        .collect()
}

#[inline]
fn from_key(config: &Value, key: &str, options: &KeyOptions) -> io::Result<Vec<PolicyEntry>> {
    let Some(items) = config.get(key).and_then(Value::as_array) else {
        return Ok(Vec::new());
    };
    items
        .iter()
        .map(|item| key_entry(item, key, options))
        .collect()
}

fn key_entry(item: &Value, key: &str, options: &KeyOptions) -> io::Result<PolicyEntry> {
    let fallback_key =
        if options.version_key == "supportedRange" { "version" } else { "supportedRange" };
    let version = non_empty_field(item, options.version_key)
        .or_else(|| non_empty_field(item, fallback_key))
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    r#"env.jsonc: "policy.{key}" entry must be a property with a "{}" field. got "{item}""#,
                    options.version_key,
                ),
            )
        })?;
    let name = entry_name(item).unwrap_or_default();
    let flag = |field: &str| item.get(field).is_some_and(truthy);
    Ok(PolicyEntry {
        force: options.force.unwrap_or_else(|| flag("force")),
        hidden: flag("hidden"),
        optional: flag("optional"),
        workspace_singleton: flag("workspaceSingleton"),
        r#override: flag("override"),
        source: Some(options.source.to_owned()),
        ..entries::entry(name, version, options.lifecycle)
    })
}

#[inline]
fn non_empty_field<'a>(item: &'a Value, field: &str) -> Option<&'a str> {
    item.get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|val| !val.is_empty())
}

/// `mergeEnvManifestPolicy` followed by `mergeEnvManifests`: for each of `peers`,
/// `dev` and `runtime`, a child entry replaces the parent entry of the same name and
/// entries with version `-` are dropped. The merged manifest keeps the parent's
/// `extends` so resolution continues upwards.
#[must_use]
pub fn merge_manifests(parent: &Value, child: &Value) -> Value {
    let mut policy = Map::new();
    for key in ["peers", "dev", "runtime"] {
        let children = policy_items(child, key);
        let child_names: std::collections::HashSet<&str> = children
            .iter()
            .filter_map(entry_name)
            .collect();
        let mut merged: Vec<Value> = policy_items(parent, key)
            .iter()
            .filter(|entry| entry_name(entry).is_none_or(|name| !child_names.contains(name)))
            .cloned()
            .collect();
        merged.extend(children.iter().cloned());
        merged.retain(|entry| {
            non_empty_field(entry, "version") != Some("-")
                && non_empty_field(entry, "supportedRange") != Some("-")
        });
        policy.insert(key.to_owned(), Value::Array(merged));
    }
    let mut result = json!({ "policy": policy, "patterns": merge_patterns(parent, child) });
    if let Some(extends) = parent.get("extends") {
        result["extends"] = extends.clone();
    }
    result
}

#[inline]
fn entry_name(entry: &Value) -> Option<&str> {
    non_empty_field(entry, "name").or_else(|| non_empty_field(entry, "packageName"))
}

/// The dev-files customizer: `{ ...parent.patterns, ...child.patterns }`.
#[inline]
fn merge_patterns(parent: &Value, child: &Value) -> Value {
    let mut patterns = parent
        .get("patterns")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(child) = child.get("patterns").and_then(Value::as_object) {
        patterns.extend(child.clone());
    }
    Value::Object(patterns)
}

#[inline]
fn policy_items<'a>(manifest: &'a Value, key: &str) -> &'a [Value] {
    manifest
        .get("policy")
        .and_then(|policy| policy.get(key))
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}
