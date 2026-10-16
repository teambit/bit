//! `EnvPolicy.fromConfigObject`, `VariantPolicy.mergePolices`, and their
//! legacy forced/auto-detected projections. Later policies win per lifecycle.

use super::{FIELDS, NODE_DEV_DEPENDENCIES, NODE_PEERS, RESOLVER};
use crate::commands::status::js::{array, decline, nullish, object, text, truthy};
use serde_json::{Map, Value, json};
use std::{collections::HashSet, io};

type Fields = [Map<String, Value>; 3];

pub(super) struct Policy {
    pub(super) manual: Fields,
    pub(super) automatic: Fields,
    pub(super) env_own: Map<String, Value>,
}

struct Entry {
    name: String,
    version: String,
    field: usize,
    force: bool,
}

impl Policy {
    pub(super) fn read(context: &Value, target: &Value, extensions: &[Value]) -> io::Result<Self> {
        let identity = text(target.get("identity"))?;
        let facts = &context["environmentFacts"][identity];
        let default = default_environment();
        let raw = facts.get("envPolicy").unwrap_or(&default);
        let mut entries = environment(raw)?;
        if let Some(own) = facts.get("envOwnPolicy") {
            entries.extend(variant(own, Some(true))?);
        }
        entries.extend(registered(facts)?);
        let config = extensions
            .iter()
            .find(|entry| entry["name"] == RESOLVER);
        if let Some(policy) = nullish(config.and_then(|entry| entry["config"].get("policy"))) {
            entries.extend(variant(policy, None)?);
        }
        let env_own = match facts.get("envOwnPolicy") {
            Some(policy) => manifest(&variant(policy, Some(true))?),
            None => Map::new(),
        };
        Ok(Self::project(merge(entries), env_own))
    }

    fn project(entries: Vec<Entry>, env_own: Map<String, Value>) -> Self {
        let mut manual = Fields::default();
        let mut automatic = Fields::default();
        let mut used = HashSet::new();
        for entry in entries {
            if !entry.force {
                automatic[entry.field].insert(entry.name, json!(entry.version));
            } else if entry.version == "-" || used.insert(entry.name.clone()) {
                manual[entry.field].insert(entry.name, json!(entry.version));
            }
        }
        Self { manual, automatic, env_own }
    }

    pub(super) fn overrides(&self) -> Value {
        let mut value = Map::new();
        for (field, map) in FIELDS.iter().zip(&self.manual) {
            if !map.is_empty() {
                value.insert((*field).to_string(), json!(map));
            }
        }
        Value::Object(value)
    }
}

pub(super) fn automatic(raw: &Value) -> io::Result<Fields> {
    let mut fields = Fields::default();
    for entry in variant(raw, None)? {
        if !entry.force {
            fields[entry.field].insert(entry.name, json!(entry.version));
        }
    }
    Ok(fields)
}

fn default_environment() -> Value {
    let dev: Map<String, Value> = NODE_DEV_DEPENDENCIES
        .iter()
        .map(|(name, version)| ((*name).to_string(), json!(version)))
        .collect();
    let peers: Vec<Value> = NODE_PEERS
        .iter()
        .map(|(name, range)| json!({"name":name,"supportedRange":range}))
        .collect();
    json!({"devDependencies":dev,"peers":peers})
}

fn registered(facts: &Value) -> io::Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for policy in array(facts.get("registeredEnvPolicy"), "registered policies")? {
        entries.extend(variant(policy, None)?);
        entries = merge(entries);
    }
    Ok(entries)
}

fn environment(raw: &Value) -> io::Result<Vec<Entry>> {
    let mut entries = variant(raw, Some(true))?;
    let mut modern = Vec::new();
    for (name, field, version) in
        [("peers", 2, "supportedRange"), ("dev", 1, "version"), ("runtime", 0, "version")]
    {
        for value in array(raw.get(name), "environment policy")? {
            modern.push(entry(
                text(value.get("name"))?,
                value.get(version),
                field,
                truthy(value.get("force")),
            )?);
        }
    }
    entries.extend(unique(modern));
    Ok(merge(entries))
}

fn variant(raw: &Value, force: Option<bool>) -> io::Result<Vec<Entry>> {
    let raw = object(raw)?;
    let mut entries = Vec::new();
    for (field, name) in FIELDS.iter().enumerate() {
        let Some(value) = raw
            .get(*name)
            .filter(|value| truthy(Some(value)))
        else {
            continue;
        };
        if let Some(values) = value.as_array() {
            array_entries(values, field, force, &mut entries)?;
        } else {
            object_entries(value, field, force, &mut entries)?;
        }
    }
    Ok(unique(entries))
}

fn object_entries(
    value: &Value,
    field: usize,
    force: Option<bool>,
    entries: &mut Vec<Entry>,
) -> io::Result<()> {
    for (name, value) in object(value)? {
        if truthy(Some(value)) {
            entries.push(entry(name, Some(value), field, force.unwrap_or(true))?);
        }
    }
    Ok(())
}

fn array_entries(
    values: &[Value],
    field: usize,
    force: Option<bool>,
    entries: &mut Vec<Entry>,
) -> io::Result<()> {
    for value in values {
        entries.push(entry(
            text(value.get("name"))?,
            value.get("version"),
            field,
            force.unwrap_or_else(|| truthy(value.get("force"))),
        )?);
    }
    Ok(())
}

fn entry(name: &str, value: Option<&Value>, field: usize, force: bool) -> io::Result<Entry> {
    let value = value.ok_or_else(|| decline("status missing policy version"))?;
    let version = value
        .as_str()
        .or_else(|| value.get("version").and_then(Value::as_str));
    let version = version
        .filter(|version| !version.is_empty())
        .ok_or_else(|| decline("status invalid policy version"))?;
    Ok(Entry { name: name.to_string(), version: version.to_string(), field, force })
}

fn merge(mut entries: Vec<Entry>) -> Vec<Entry> {
    entries.reverse();
    unique(entries)
}

fn unique(mut entries: Vec<Entry>) -> Vec<Entry> {
    let mut seen = HashSet::new();
    entries.retain(|entry| seen.insert((entry.name.clone(), entry.field)));
    entries
}

fn manifest(entries: &[Entry]) -> Map<String, Value> {
    entries
        .iter()
        .map(|entry| (entry.name.clone(), json!(entry.version)))
        .collect()
}

#[cfg(test)]
mod tests;
