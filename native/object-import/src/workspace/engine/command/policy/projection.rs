use super::super::invalid;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

pub(super) const DEPRECATION: &str = "teambit.component/deprecation";
const BUILDER: &str = "teambit.pipelines/builder";

pub(super) const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
pub(super) const CORES: &[&str] = &[
    "teambit.envs/envs",
    RESOLVER,
    "teambit.component/dev-files",
    "teambit.semantics/schema",
    "teambit.pkg/pkg",
    "teambit.preview/preview",
    "teambit.compositions/compositions",
    "teambit.docs/docs",
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Defaults {
    pub(super) env: Value,
    pub(super) policy_entries: Vec<Value>,
    pub(super) component_range_prefix: Option<String>,
    pub(super) dev_patterns: Value,
    pub(super) dev_files: Value,
    pub(super) slot_data: Vec<Value>,
}

pub(super) fn extensions(
    stored: &Value,
    configs: &Value,
    state: &Value,
    defaults: &Defaults,
    package_name: &str,
) -> io::Result<Value> {
    if defaults.env["id"] != "teambit.harmony/node" || !defaults.env["data"].is_object() {
        return Err(invalid("command default Node descriptor"));
    }
    let mut entries = configured_entries(stored, configs)?;
    upsert(&mut entries, "teambit.envs/envs", &defaults.env["data"])?;
    upsert(
        &mut entries,
        RESOLVER,
        &json!({"packageName":package_name,
        "dependencies":dependencies(state, &defaults.policy_entries)?,
        "policy":defaults.policy_entries,"componentRangePrefix":defaults.component_range_prefix}),
    )?;
    if defaults.component_range_prefix.is_none() {
        entries
            .iter_mut()
            .find(|row| row["name"] == RESOLVER)
            .unwrap()["data"]
            .as_object_mut()
            .unwrap()
            .remove("componentRangePrefix");
    }
    upsert(
        &mut entries,
        "teambit.component/dev-files",
        &json!({
        "devPatterns":defaults.dev_patterns,"devFiles":defaults.dev_files}),
    )?;
    apply_slots(&mut entries, defaults)?;
    Ok(Value::Array(entries))
}

fn apply_slots(entries: &mut Vec<Value>, defaults: &Defaults) -> io::Result<()> {
    let mut seen = HashSet::new();
    for slot in &defaults.slot_data {
        let name = slot["id"].as_str().ok_or_else(|| invalid("command default slot identity"))?;
        if !CORES[3..].contains(&name) || !seen.insert(name) {
            return Err(invalid("command unsupported default slot"));
        }
        upsert(entries, name, &slot["data"])?;
        let data = &mut entries
            .iter_mut()
            .find(|row| row["name"] == name)
            .unwrap()["data"];
        for key in array(&slot["undefinedKeys"])? {
            data.as_object_mut()
                .unwrap()
                .remove(key.as_str().ok_or_else(|| invalid("command undefined data key"))?);
        }
    }
    if seen.len() != CORES.len() - 3 {
        return Err(invalid("command incomplete default slots"));
    }
    Ok(())
}

fn configured_entries(stored: &Value, configs: &Value) -> io::Result<Vec<Value>> {
    let mut entries = Vec::new();
    for config in array(configs)? {
        let name = core(config)?;
        let mut entry = config.clone();
        entry["data"] = stored
            .as_array()
            .into_iter()
            .flatten()
            .find(|row| row["name"] == name)
            .and_then(|row| row.get("data"))
            .cloned()
            .unwrap_or_else(|| json!({}));
        entries.push(entry);
    }
    Ok(entries)
}

fn upsert(entries: &mut Vec<Value>, name: &str, data: &Value) -> io::Result<()> {
    let data = data.as_object().ok_or_else(|| invalid("command aspect data"))?;
    if let Some(entry) = entries
        .iter_mut()
        .find(|row| row["name"] == name)
    {
        let existing =
            entry["data"].as_object_mut().ok_or_else(|| invalid("command stored aspect data"))?;
        existing.extend(data.clone());
    } else {
        entries.push(json!({"name":name,"config":{},"data":data}));
    }
    Ok(())
}

pub(super) fn entries(extensions: &Value) -> io::Result<Value> {
    array(extensions)?.iter().map(|entry| {
        let name = core(entry)?;
        let mut config = entry.get("config").cloned().unwrap_or_else(|| json!({}));
        if let Some(config) = config.as_object_mut() { config.remove("__specific"); }
        if !config.is_object() && config != "-" { return Err(invalid("command aspect config")); }
        Ok(json!({"name":name,"stringId":name,"idWithoutVersion":name,
            "configJson":serde_json::to_string(&config).map_err(io::Error::other)?,
            "configPretty":serde_json::to_string_pretty(&config).map_err(io::Error::other)?,
            "config":config,"data":entry.get("data").cloned().unwrap_or_else(|| json!({})),"dataUndefinedKeys":[]}))
    }).collect::<io::Result<Vec<_>>>().map(Value::Array)
}

fn core(entry: &Value) -> io::Result<&str> {
    let name = entry["name"].as_str().ok_or_else(|| invalid("command aspect identity"))?;
    if name == DEPRECATION {
        passive_deprecation(&entry["config"])?;
    } else if name == BUILDER {
        passive_builder(&entry["config"])?;
    } else if !CORES.contains(&name) {
        return Err(invalid("command custom aspect"));
    }
    Ok(name)
}

fn passive_builder(config: &Value) -> io::Result<()> {
    let fields = config.as_object().ok_or_else(|| invalid("command builder configuration"))?;
    if fields
        .iter()
        .any(|(name, value)| name != "__specific" || !value.is_boolean())
    {
        return Err(invalid("command unsupported builder configuration"));
    }
    Ok(())
}

fn passive_deprecation(config: &Value) -> io::Result<()> {
    let fields = config.as_object().ok_or_else(|| invalid("command deprecation configuration"))?;
    if fields
        .iter()
        .any(|(name, value)| {
            !matches!(name.as_str(), "deprecate" | "__specific") || !value.is_boolean()
        })
    {
        return Err(invalid("command unsupported deprecation configuration"));
    }
    Ok(())
}

pub(super) fn configuration_cores() -> Vec<&'static str> {
    CORES
        .iter()
        .copied()
        .chain([DEPRECATION, BUILDER])
        .collect()
}

fn component_dependency(entry: &Value, lifecycle: &str) -> io::Result<Value> {
    let identity =
        entry["identity"].as_str().ok_or_else(|| invalid("command dependency identity"))?;
    let (name, version) =
        identity.rsplit_once('@').ok_or_else(|| invalid("command unversioned dependency"))?;
    let (scope, name) = name.split_once('/').ok_or_else(|| invalid("command dependency scope"))?;
    let package = entry["packageName"]
        .as_str()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("command missing dependency package name"))?;
    let mut row = json!({"id":identity,"version":version,"__type":"component","lifecycle":lifecycle,
                "componentId":{"scope":scope,"name":name,"version":version},"isExtension":false,"packageName":package});
    if let Some(range) = entry["versionRange"].as_str() {
        row["versionRange"] = json!(range);
    }
    Ok(row)
}

fn dependencies(state: &Value, policies: &[Value]) -> io::Result<Vec<Value>> {
    let mut rows = Vec::new();
    for (field, lifecycle) in ["runtime", "dev", "peer"].iter().enumerate() {
        for index in array(&state["components"][field])? {
            let entry = &state["entries"]
                [index.as_u64().ok_or_else(|| invalid("command dependency index"))? as usize];
            let row = component_dependency(entry, lifecycle)?;
            rows.push(row);
        }
    }
    for (field, lifecycle) in ["runtime", "dev", "peer"].iter().enumerate() {
        for (name, version) in state["packages"][field]
            .as_object()
            .ok_or_else(|| invalid("command package dependencies"))?
        {
            rows.push(
                json!({"id":name,"version":version,"__type":"package","lifecycle":lifecycle}),
            );
        }
    }
    let mut seen = HashSet::new();
    rows.retain(|row| seen.insert(row["id"].as_str().unwrap().to_owned()));
    tag_dependencies(&mut rows, policies);
    order_dependencies(&mut rows);
    Ok(rows)
}

fn tag_dependencies(rows: &mut [Value], policies: &[Value]) {
    for row in rows {
        let policy = policies
            .iter()
            .find(|policy| policy["dependencyId"] == row["id"])
            .or_else(|| {
                policies
                    .iter()
                    .find(|policy| {
                        !row["packageName"].is_null()
                            && policy["dependencyId"] == row["packageName"]
                    })
            });
        row["source"] = policy
            .and_then(|policy| policy.get("source"))
            .cloned()
            .unwrap_or_else(|| json!("auto"));
        for field in ["hidden", "optional"] {
            if let Some(value) = policy.and_then(|policy| policy.get(field)) {
                row[field] = value.clone();
            }
        }
    }
}

fn order_dependencies(rows: &mut [Value]) {
    for row in rows {
        let source = row.as_object().unwrap();
        let mut ordered = serde_json::Map::new();
        for field in [
            "id",
            "version",
            "versionRange",
            "__type",
            "lifecycle",
            "source",
            "hidden",
            "optional",
            "componentId",
            "isExtension",
            "packageName",
        ] {
            if let Some(value) = source.get(field) {
                ordered.insert(field.into(), value.clone());
            }
        }
        *row = Value::Object(ordered);
    }
}

pub(super) fn array(value: &Value) -> io::Result<&Vec<Value>> {
    value
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("command policy rows"))
}

#[cfg(test)]
mod tests;
