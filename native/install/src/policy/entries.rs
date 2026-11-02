//! Policy entries from config objects (`WorkspacePolicyFactory`, `VariantPolicy.fromConfigObject`)
//! and the shared `mergePolices` deduplication rule.
//!
//! Extracts runtime, dev, and peer [`PolicyEntry`] items and deduplicates them in priority order.

use crate::model::{Lifecycle, Manifest, PolicyEntry};
use serde_json::{Map, Value};

/// The `package.json` dependency fields in Bit's `DEPENDENCIES_FIELDS` order.
pub const FIELDS: [(&str, Lifecycle); 3] = [
    ("dependencies", Lifecycle::Runtime),
    ("devDependencies", Lifecycle::Dev),
    ("peerDependencies", Lifecycle::Peer),
];

/// Options controlling source label, `force`, and `hidden` defaults in `VariantPolicy.fromConfigObject`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct VariantOptions {
    /// Policy entry origin label (such as `"env"` or `"config"`).
    pub source: Option<&'static str>,
    /// Default `force` flag applied when an entry does not specify its own `force` property.
    pub force: Option<bool>,
    /// Default `hidden` flag applied when an entry does not specify its own `hidden` property.
    pub hidden: Option<bool>,
}

/// A policy entry with every flag off.
#[must_use]
#[inline]
pub fn entry(name: &str, version: &str, lifecycle: Lifecycle) -> PolicyEntry {
    PolicyEntry {
        name: name.trim().to_owned(),
        version: version.trim().to_owned(),
        lifecycle,
        force: false,
        optional: false,
        hidden: false,
        preserve: None,
        workspace_singleton: false,
        r#override: false,
        source: None,
        resolve_from_env: false,
    }
}

/// `mergePolices`: concatenate, reverse, keep the first entry per `(name, lifecycle)`,
/// so the last policy wins and the merged order is reversed.
#[must_use]
#[inline]
pub fn merge(policies: Vec<Vec<PolicyEntry>>) -> Vec<PolicyEntry> {
    let mut all: Vec<PolicyEntry> = policies.into_iter().flatten().collect();
    all.reverse();
    uniq(all)
}

/// `uniqWith` on `(name, lifecycle)`: the first entry wins.
#[must_use]
pub fn uniq(entries: Vec<PolicyEntry>) -> Vec<PolicyEntry> {
    let mut result: Vec<PolicyEntry> = Vec::with_capacity(entries.len());
    for entry in entries {
        let name = entry.name.trim();
        if !result
            .iter()
            .any(|kept| kept.name.trim() == name && kept.lifecycle == entry.lifecycle)
        {
            result.push(entry);
        }
    }
    result
}

/// `WorkspacePolicyFactory.fromConfigObject`: `dependencies` (runtime) and
/// `peerDependencies`, values a range or `{ version, preserve }`. The merge-config
/// form, an array of `{ name, version }`, is accepted as well.
#[must_use]
pub fn from_workspace_config(config: &Value) -> Vec<PolicyEntry> {
    let mut entries = Vec::new();
    for (key, lifecycle) in
        [("dependencies", Lifecycle::Runtime), ("peerDependencies", Lifecycle::Peer)]
    {
        for (name, value) in field_values(config.get(key)) {
            let name = name.trim();
            if name.is_empty() {
                continue;
            }
            let (version, preserve) = match value {
                Value::Object(object) => {
                    (string(object.get("version")), object.get("preserve").and_then(Value::as_bool))
                }
                other => (string(Some(other)), None),
            };
            let Some(version) = version else { continue };
            entries.push(PolicyEntry { preserve, ..entry(name, &version, lifecycle) });
        }
    }
    uniq(entries)
}

/// `WorkspacePolicyFactory.fromPackageJson`: dev and regular dependencies are both
/// runtime (regular wins), peers stay peers.
#[must_use]
pub fn from_package_json(package_json: &Manifest) -> Vec<PolicyEntry> {
    let mut dependencies = object(package_json.get("devDependencies"));
    dependencies.extend(object(package_json.get("dependencies")));
    let config = serde_json::json!({
        "dependencies": dependencies,
        "peerDependencies": object(package_json.get("peerDependencies")),
    });
    from_workspace_config(&config)
}

/// `VariantPolicy.fromConfigObject`. Object form entries are forced unless
/// `options.force` says otherwise; array form entries take their own flags.
#[must_use]
pub fn from_variant_config(config: &Value, options: &VariantOptions) -> Vec<PolicyEntry> {
    let mut entries = Vec::new();
    for (key, lifecycle) in FIELDS {
        match config.get(key) {
            Some(Value::Array(items)) => entries.extend(
                items.iter().filter_map(|item| array_entry(item, lifecycle, options)),
            ),
            Some(Value::Object(map)) => {
                entries.extend(
                    map.iter()
                        .filter_map(|(name, value)| object_entry(name, value, lifecycle, options)),
                );
            }
            _ => {}
        }
    }
    uniq(entries)
}

fn object_entry(
    name: &str,
    value: &Value,
    lifecycle: Lifecycle,
    options: &VariantOptions,
) -> Option<PolicyEntry> {
    if !truthy(value) {
        return None;
    }
    let mut created = value_entry(name, value, lifecycle)?;
    created.force = options.force.unwrap_or(true);
    created.hidden = options.hidden.unwrap_or(false);
    created.source = options.source.map(str::to_owned);
    Some(created)
}

fn array_entry(
    item: &Value,
    lifecycle: Lifecycle,
    options: &VariantOptions,
) -> Option<PolicyEntry> {
    let name = string(
        item.get("name")
            .or_else(|| item.get("packageName")),
    )?;
    let version = string(
        item.get("version")
            .or_else(|| item.get("supportedRange")),
    )?;
    let flag = |key: &str| item.get(key).is_some_and(truthy);
    Some(PolicyEntry {
        force: options.force.unwrap_or_else(|| flag("force")),
        hidden: options.hidden.unwrap_or_else(|| flag("hidden")),
        optional: flag("optional"),
        source: Some(options.source.unwrap_or("config").to_owned()),
        ..entry(&name, &version, lifecycle)
    })
}

/// `createVariantPolicyEntry` for a string or
/// `{ version, resolveFromEnv, optional, workspaceSingleton, override }` value.
#[must_use]
pub fn value_entry(name: &str, value: &Value, lifecycle: Lifecycle) -> Option<PolicyEntry> {
    match value {
        Value::String(version) => Some(entry(name, version, lifecycle)),
        Value::Object(object) => {
            let version = string(
                object
                    .get("version")
                    .or_else(|| object.get("supportedRange")),
            )?;
            let flag = |key: &str| object.get(key).is_some_and(truthy);
            Some(PolicyEntry {
                optional: flag("optional"),
                workspace_singleton: flag("workspaceSingleton"),
                r#override: flag("override"),
                resolve_from_env: flag("resolveFromEnv"),
                ..entry(name, &version, lifecycle)
            })
        }
        _ => None,
    }
}

/// `{ name: version }` pairs of a policy field in either the object or the array form.
fn field_values(field: Option<&Value>) -> Vec<(&str, &Value)> {
    match field {
        Some(Value::Object(map)) => map
            .iter()
            .map(|(name, value)| (name.as_str(), value))
            .collect(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| {
                let name = item
                    .get("name")
                    .or_else(|| item.get("packageName"))?
                    .as_str()?;
                let version = item
                    .get("version")
                    .or_else(|| item.get("supportedRange"))?;
                Some((name, version))
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// JavaScript truthiness of a JSON value.
#[must_use]
#[inline]
pub fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(flag) => *flag,
        Value::Number(number) => number
            .as_f64()
            .is_some_and(|number| number != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

#[inline]
fn string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

#[inline]
fn object(value: Option<&Value>) -> Map<String, Value> {
    value
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}
