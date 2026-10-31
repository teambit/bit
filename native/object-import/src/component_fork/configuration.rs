use super::{
    Options,
    identity::{Identity, source_id},
    unsupported,
};
use serde_json::{Value, json};
use std::io;

pub(super) fn insert(
    bitmap: &mut Value,
    options: &Options,
    source: &Value,
    id: &Identity,
) -> io::Result<()> {
    let config = config(options, source)?;
    let row = json!({"name":id.name,"scope":"","version":"","defaultScope":id.scope,"mainFile":id.main,"rootDir":id.directory,"config":config});
    let rows = bitmap.as_object_mut().ok_or_else(|| unsupported("fork bitmap object"))?;
    let key = crate::component_rename::copy_refactor::target_key(rows, &id.name, &id.target)?;
    rows.insert(key, row);
    Ok(())
}
fn config(options: &Options, source: &Value) -> io::Result<Value> {
    let mut result = json!({});
    if source["skipConfig"] != true {
        copy(&mut result, source)?;
    }
    if !options.no_link {
        let (scope, name) = source_id(options, source)?;
        let mut id = json!({"name":name,"scope":scope});
        let version = source_version(source);
        if let Some(version) = version {
            id["version"] = json!(version);
        }
        let id = source
            .get("sourceId")
            .filter(|id| id.is_object())
            .cloned()
            .unwrap_or(id);
        result["teambit.component/forking"] = json!({"forkedFrom":id});
    }
    if let Some(overrides) = source.get("config") {
        for (key, value) in
            overrides.as_object().ok_or_else(|| unsupported("fork config override object"))?
        {
            result[key] = value.clone();
        }
    }
    Ok(result)
}
fn source_version(source: &Value) -> Option<&str> {
    source["version"]
        .as_str()
        .or_else(|| {
            source["identity"]
                .as_str()
                .and_then(|id| id.split_once('@').map(|(_, version)| version))
        })
}
fn copy(output: &mut Value, source: &Value) -> io::Result<()> {
    if let Some(configs) = source.get("sourceConfigs") {
        return copy_configs(output, configs);
    }
    let Some(entries) = source["current"]["extensions"].as_array() else { return Ok(()) };
    for entry in entries {
        let Some(key) = extension_key(entry) else {
            continue;
        };
        insert_config(output, &key, &entry["config"]);
    }
    Ok(())
}
fn extension_key(entry: &Value) -> Option<String> {
    if let Some(key) = entry["id"]
        .as_str()
        .or_else(|| entry["name"].as_str())
        .or_else(|| entry["extensionId"].as_str())
    {
        return Some(key.to_owned());
    }
    let ext = &entry["extensionId"];
    let scope = ext["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())?;
    let name = ext["name"]
        .as_str()
        .filter(|name| !name.is_empty())?;
    let version = ext["version"]
        .as_str()
        .filter(|version| !version.is_empty());
    Some(version.map_or_else(
        || format!("{scope}/{name}"),
        |version| format!("{scope}/{name}@{version}"),
    ))
}
fn copy_configs(output: &mut Value, configs: &Value) -> io::Result<()> {
    if let Some(entries) = configs.as_array() {
        for entry in entries {
            let key =
                entry["id"].as_str().ok_or_else(|| unsupported("fork source config identity"))?;
            insert_config(output, key, &entry["config"]);
        }
        return Ok(());
    }
    for (key, value) in configs.as_object().ok_or_else(|| unsupported("fork source configs"))? {
        insert_config(output, key, value);
    }
    Ok(())
}
fn insert_config(output: &mut Value, key: &str, config: &Value) {
    let bare = match key.split_once('@') {
        Some((prefix, _)) if !prefix.is_empty() => prefix,
        _ => key,
    };
    if !matches!(bare, "teambit.pkg/pkg" | "teambit.component/renaming")
        && bit_workspace_config::truthy(config)
    {
        output[key] = config.clone();
    }
}
