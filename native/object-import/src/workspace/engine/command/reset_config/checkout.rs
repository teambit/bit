//! `ComponentWriter`'s existing config file replacement, excluding local component/variant overrides.
use super::{Record, invalid};
use crate::workspace::engine::command::materialization;
use serde_json::{Map, Value, json};
use std::{collections::HashSet, io};

pub(super) fn document(
    record: &Record,
    target: &Value,
    material: &materialization::Prepared,
    original: &Value,
) -> io::Result<Value> {
    let identity =
        target["identity"].as_str().ok_or_else(|| invalid("checkout config identity"))?;
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("checkout config scope"))?;
    let mut extensions = Map::new();
    let mut seen = HashSet::new();
    add_config(&mut extensions, &mut seen, &target["componentConfig"], record)?;
    add_config(
        &mut extensions,
        &mut seen,
        &record.context["pendingConfigurations"][identity]["config"],
        record,
    )?;
    let rows = material.version["extensions"]
        .as_array()
        .ok_or_else(|| invalid("checkout config extensions"))?;
    for specific in [true, false] {
        if !specific && original["propagate"] != true {
            continue;
        }
        for row in rows
            .iter()
            .filter(|row| (row["config"]["__specific"] == true) == specific)
        {
            let id = identifier(row)?;
            insert(&mut extensions, &mut seen, &id, &row["config"], record, true)?;
        }
    }
    strip_local_env(&mut extensions, record);
    Ok(
        json!({"componentId":{"scope":scope,"name":name,"version":material.version_name},"propagate":false,"extensions":extensions}),
    )
}

fn add_config(
    extensions: &mut Map<String, Value>,
    seen: &mut HashSet<String>,
    config: &Value,
    record: &Record,
) -> io::Result<()> {
    let Some(config) = config.as_object() else { return Ok(()) };
    for (id, value) in config {
        insert(extensions, seen, id, value, record, false)?;
    }
    Ok(())
}

fn insert(
    extensions: &mut Map<String, Value>,
    seen: &mut HashSet<String>,
    id: &str,
    value: &Value,
    record: &Record,
    prefer_workspace: bool,
) -> io::Result<()> {
    let base = id.rsplit_once('@').map_or(id, |(base, _)| base);
    if !seen.insert(base.to_owned()) || id.starts_with("file:") {
        return Ok(());
    }
    if value == "-" {
        return Ok(());
    }
    let mut config = value
        .as_object()
        .cloned()
        .ok_or_else(|| invalid("checkout aspect configuration"))?;
    config.remove("__specific");
    let workspace = record.targets
        .iter()
        .find(|target| target["identity"] == base);
    let id = if let Some(target) = workspace.filter(|_| prefer_workspace || id == base) {
        target["version"]
            .as_str()
            .filter(|version| !version.is_empty())
            .map_or_else(|| base.to_owned(), |version| format!("{base}@{version}"))
    } else {
        id.to_owned()
    };
    extensions.insert(id, Value::Object(config));
    Ok(())
}

fn identifier(row: &Value) -> io::Result<String> {
    if let Some(id) = row.get("extensionId") {
        if let Some(id) = id.as_str() {
            return Ok(id.to_owned());
        }
        let name = id["name"].as_str().ok_or_else(|| invalid("checkout aspect name"))?;
        let scope = id["scope"].as_str().unwrap_or_default();
        let base = if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") };
        return Ok(id["version"]
            .as_str()
            .filter(|version| !version.is_empty() && *version != "latest")
            .map_or_else(|| base.clone(), |version| format!("{base}@{version}")));
    }
    row.get("name")
        .or_else(|| row.get("legacyId"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| invalid("checkout aspect identity"))
}

fn strip_local_env(extensions: &mut Map<String, Value>, record: &Record) {
    let Some(env) = extensions
        .get("teambit.envs/envs")
        .and_then(|value| value["env"].as_str())
    else {
        return;
    };
    let env = env.to_owned();
    if !record.targets
        .iter()
        .any(|target| target["identity"] == env)
    {
        return;
    }
    let key = extensions
        .keys()
        .find(|key| {
            key.rsplit_once('@')
                .is_some_and(|(base, _)| base == env)
        })
        .cloned();
    if let Some(key) = key
        && let Some(value) = extensions.remove(&key)
    {
        extensions.insert(env, value);
    }
}
