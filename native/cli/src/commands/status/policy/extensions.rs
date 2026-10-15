//! `statusExtensions(version, target)`: the core aspects configured on the
//! stored version, with bitmap configuration applied, for components that
//! only use the built-in Node environment.

use super::super::js::{array, decline, nullish, object, truthy};
use serde_json::{Map, Value, json};
use std::io;

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
const DEPRECATION: &str = "teambit.component/deprecation";
const REMOVAL: &str = "teambit.component/remove";
const CORES: [&str; 11] = [
    "teambit.envs/envs",
    RESOLVER,
    "teambit.component/dev-files",
    "teambit.semantics/schema",
    "teambit.pkg/pkg",
    "teambit.preview/preview",
    "teambit.compositions/compositions",
    "teambit.docs/docs",
    DEPRECATION,
    REMOVAL,
    "teambit.pipelines/builder",
];

/// Pending dependency and custom configuration need canonical projection.
/// A soft-removal flag can be applied to the core extension here.
pub(super) fn pending_merge_config(target: &Value) -> bool {
    if !truthy(target.get("resolveConfig")) {
        return false;
    }
    let Some(config) = target.get("mergedConfig") else { return false };
    let Some(entries) = config.as_object() else { return true };
    entries
        .iter()
        .any(|(name, value)| {
            name != REMOVAL
                || value
                    .as_object()
                    .is_none_or(|removal| {
                        removal.len() != 1 || removal.get("removed") != Some(&Value::Bool(true))
                    })
        })
}

pub fn status_extensions(version: Option<&Value>, target: &Value) -> io::Result<Vec<Value>> {
    let stored = array(version.and_then(|stored| stored.get("extensions")), "extensions")?;
    if stored
        .iter()
        .any(|extension| truthy(extension.get("extensionId")) || truthy(extension.get("legacyId")))
    {
        return Err(decline("status model extension dependency"));
    }
    if array(target.get("mergedConfigNames"), "merged configuration names")?
        .iter()
        .any(|name| name.as_str() != Some(REMOVAL))
    {
        return Err(decline("status merged configuration"));
    }
    if target.get("bitmapConfig").is_some() {
        return Err(decline("status recovery bitmap configuration"));
    }
    let mut extensions = Vec::new();
    for extension in selected(stored, target) {
        let name = extension
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if extensions
            .iter()
            .any(|known: &Value| known["name"] == name)
        {
            continue;
        }
        extensions.push(model_extension(extension, name)?);
    }
    apply_component_config(&mut extensions, target)?;
    apply_merged_removal(&mut extensions, target);
    Ok(extensions)
}

fn apply_merged_removal(extensions: &mut Vec<Value>, target: &Value) {
    if target.get("resolveConfig") != Some(&Value::Bool(true))
        || target["mergedConfig"][REMOVAL]["removed"] != true
    {
        return;
    }
    let removal = json!({"name": REMOVAL, "config": {"removed": true}});
    match extensions
        .iter()
        .position(|entry| entry["name"] == REMOVAL)
    {
        Some(index) => extensions[index] = removal,
        None => extensions.push(removal),
    }
}

fn is_specific(extension: &Value) -> bool {
    extension
        .get("config")
        .and_then(|config| config.get("__specific"))
        == Some(&Value::Bool(true))
}

/// The component's own (`__specific`) entries first; without propagation, only them.
fn selected<'v>(stored: &'v [Value], target: &Value) -> Vec<&'v Value> {
    let config = target.get("config");
    let specific = stored.iter().filter(|extension| is_specific(extension));
    if truthy(config) && !truthy(config.and_then(|config| config.get("propagate"))) {
        return specific.collect();
    }
    specific
        .chain(
            stored
                .iter()
                .filter(|extension| !is_specific(extension)),
        )
        .collect()
}

fn model_extension(extension: &Value, name: &str) -> io::Result<Value> {
    if !CORES.contains(&name) {
        return Err(decline("status configured model extension"));
    }
    let stored_config = nullish(extension.get("config"));
    let mut config = match stored_config {
        None => Map::new(),
        Some(config) => object(config)?.clone(),
    };
    config.remove("__specific");
    validate_config(name, &config)?;
    if name == "teambit.envs/envs" {
        let env = extension
            .get("data")
            .and_then(|data| data.get("id"));
        if env.and_then(Value::as_str) != Some("teambit.harmony/node") {
            return Err(decline("status nondefault environment"));
        }
    }
    let config = stored_config
        .cloned()
        .unwrap_or_else(|| json!({}));
    Ok(json!({ "name": name, "config": config }))
}

fn validate_config(name: &str, config: &Map<String, Value>) -> io::Result<()> {
    let deprecation_config = config
        .iter()
        .all(|(key, value)| key == "deprecate" && value.is_boolean());
    if name == DEPRECATION && !deprecation_config {
        return Err(decline("status unsupported deprecation configuration"));
    }
    if name == REMOVAL {
        validate_removal_config(config)?;
    }
    if name != RESOLVER && name != DEPRECATION && name != REMOVAL && !config.is_empty() {
        return Err(decline("status configured core extension"));
    }
    if name == RESOLVER && config.keys().any(|key| key != "policy") {
        return Err(decline("status resolver configuration"));
    }
    Ok(())
}

fn validate_removal_config(config: &Map<String, Value>) -> io::Result<()> {
    if config.get("removed") != Some(&Value::Bool(true))
        || config
            .iter()
            .any(|(key, value)| {
                !matches!(key.as_str(), "removed" | "removeOnMain") || !value.is_boolean()
            })
    {
        return Err(decline("status unsupported removal configuration"));
    }
    Ok(())
}

/// `target.config.extensions`: resolver configuration, marked specific. A
/// resolve command (`resolveConfig`) also keeps empty core entries, and
/// lists the configured aspects before the inherited ones.
fn apply_component_config(extensions: &mut Vec<Value>, target: &Value) -> io::Result<()> {
    let configured = nullish(
        target
            .get("config")
            .and_then(|config| config.get("extensions")),
    );
    let Some(configured) = configured else { return Ok(()) };
    let resolve = target.get("resolveConfig") == Some(&Value::Bool(true));
    let configured = object(configured)?;
    for (name, config) in configured {
        let config = config.as_object().ok_or_else(|| decline("status component extension"))?;
        let empty_core = resolve && CORES.contains(&name.as_str()) && config.is_empty();
        if !empty_core && (name != RESOLVER || config.keys().any(|key| key != "policy")) {
            return Err(decline("status component extension"));
        }
        let mut specific = config.clone();
        specific.insert("__specific".into(), Value::Bool(true));
        let extension = json!({ "name": name, "config": specific });
        match extensions
            .iter()
            .position(|known| known["name"] == *name)
        {
            Some(index) => extensions[index] = extension,
            None => extensions.insert(0, extension),
        }
    }
    if resolve {
        configured_first(extensions, configured);
    }
    Ok(())
}

/// The configured aspects, in configuration order, before the inherited ones.
fn configured_first(extensions: &mut Vec<Value>, configured: &Map<String, Value>) {
    let position = |extension: &Value| {
        configured
            .keys()
            .position(|name| extension["name"] == name.as_str())
    };
    let (mut first, inherited): (Vec<Value>, Vec<Value>) = extensions
        .drain(..)
        .partition(|extension| position(extension).is_some());
    first.sort_by_key(|extension| position(extension));
    extensions.extend(first);
    extensions.extend(inherited);
}
