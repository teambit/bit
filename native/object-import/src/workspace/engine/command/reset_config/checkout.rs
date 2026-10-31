//! `ComponentWriter`'s existing config file replacement, excluding local component/variant overrides.
use super::{Record, invalid};
use serde_json::{Map, Value, json};
use std::{collections::HashSet, io};

pub(super) fn document(
    record: &Record,
    target: &Value,
    version: &Value,
    version_name: &str,
    original: &Value,
) -> io::Result<Value> {
    let identity = target["identity"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("checkout config identity"))?;
    let (scope, name) = identity
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        .ok_or_else(|| invalid("checkout config scope"))?;
    let mut extensions = Map::new();
    let mut seen = HashSet::new();
    add_config(&mut extensions, &mut seen, &target["componentConfig"], record)?;
    add_config(
        &mut extensions,
        &mut seen,
        &record.context["pendingConfigurations"][identity]["config"],
        record,
    )?;
    let rows =
        version["extensions"].as_array().ok_or_else(|| invalid("checkout config extensions"))?;
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
        json!({"componentId":{"scope":scope,"name":name,"version":version_name},"propagate":false,"extensions":extensions}),
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
    let id = id.trim();
    let base = id.rsplit_once('@').map_or(id, |(base, _)| base.trim());
    if base.is_empty() || !seen.insert(base.to_owned()) || id.starts_with("file:") {
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
        .find(|target| target["identity"].as_str().map(str::trim) == Some(base));
    let id = if let Some(target) = workspace.filter(|_| prefer_workspace || id == base) {
        target["version"]
            .as_str()
            .map(str::trim)
            .filter(|version| !version.is_empty())
            .map_or_else(|| base.to_owned(), |version| format!("{base}@{version}"))
    } else {
        id.to_owned()
    };
    extensions.insert(id, Value::Object(config));
    Ok(())
}

fn identifier(row: &Value) -> io::Result<String> {
    if let Some(id) = row
        .get("extensionId")
        .filter(|val| !val.is_null())
    {
        if let Some(id) = non_empty_str(id) {
            return Ok(id
                .strip_suffix("@latest")
                .or_else(|| id.strip_suffix("@head"))
                .unwrap_or(id)
                .to_owned());
        }
        let raw_name = non_empty_str(&id["name"]).ok_or_else(|| invalid("checkout aspect name"))?;
        let (name, inline_ver) = raw_name
            .rsplit_once('@')
            .map_or((raw_name, None), |(bare, ver)| {
                (bare.trim(), Some(ver.trim()).filter(|ver| !ver.is_empty()))
            });
        if name.is_empty() {
            return Err(invalid("checkout aspect name"));
        }
        let scope = non_empty_str(&id["scope"]).unwrap_or_default();
        let base = if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") };
        return Ok(non_empty_str(&id["version"])
            .or_else(|| non_empty_str(&id["head"]))
            .or(inline_ver)
            .filter(|version| !matches!(*version, "latest" | "head"))
            .map_or_else(|| base.clone(), |version| format!("{base}@{version}")));
    }
    non_empty_str(&row["name"])
        .or_else(|| non_empty_str(&row["legacyId"]))
        .map(str::to_owned)
        .ok_or_else(|| invalid("checkout aspect identity"))
}

fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn strip_local_env(extensions: &mut Map<String, Value>, record: &Record) {
    let Some(env) = extensions
        .get("teambit.envs/envs")
        .or_else(|| {
            extensions
                .iter()
                .find_map(|(key, value)| key.starts_with("teambit.envs/envs@").then_some(value))
        })
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
