//! JSON entry builders for `bit cat-scope [-j|--json] [-e|--json-extra]`.

use serde_json::{Map, Value, json};

pub(super) fn build_component_json_obj(
    raw: &Value,
    scope: &str,
    name: String,
    hash: &str,
    json_extra: bool,
) -> Option<Value> {
    let mut map = Map::new();
    map.insert("validateBeforePersist".into(), Value::Bool(true));
    map.insert("laneDataIsPopulated".into(), Value::Bool(false));
    map.insert("scope".into(), Value::String(scope.to_owned()));
    map.insert("name".into(), Value::String(name));
    map.insert("versions".into(), map_ref_dict(raw.get("versions"))?);
    map.insert("orphanedVersions".into(), map_ref_dict(raw.get("orphanedVersions"))?);
    let lang = raw["lang"].as_str().unwrap_or("javascript");
    map.insert("lang".into(), Value::String(lang.to_owned()));
    map.insert("deprecated".into(), Value::Bool(raw["deprecated"].as_bool().unwrap_or(false)));
    let binding_prefix = raw["bindingPrefix"]
        .as_str()
        .map_or_else(|| format!("@{}", scope.split('.').next().unwrap_or(scope)), str::to_owned);
    map.insert("bindingPrefix".into(), Value::String(binding_prefix));
    map.insert(
        "state".into(),
        raw.get("state")
            .cloned()
            .unwrap_or_else(|| json!({})),
    );
    map.insert(
        "scopesList".into(),
        raw.get("remotes")
            .cloned()
            .unwrap_or_else(|| json!([])),
    );
    if let Some(head) = raw["head"].as_str() {
        map.insert("head".into(), json!({"hash": head}));
    }
    let schema = raw["schema"]
        .as_str()
        .unwrap_or_else(|| if raw["head"].is_string() { "1.0.0" } else { "0.0.0" });
    map.insert("schema".into(), Value::String(schema.to_owned()));
    map.insert("detachedHeads".into(), build_detached_heads(raw.get("detachedHeads"))?);
    if json_extra {
        map.insert("hash".into(), Value::String(hash.to_owned()));
        map.insert("type".into(), Value::String("ModelComponent".into()));
    }
    Some(Value::Object(map))
}

fn map_ref_dict(val: Option<&Value>) -> Option<Value> {
    let mut out = Map::new();
    let Some(obj) = val.and_then(Value::as_object) else {
        return Some(Value::Object(out));
    };
    for (key, hash_val) in obj {
        out.insert(key.clone(), json!({"hash": hash_val.as_str()?}));
    }
    Some(Value::Object(out))
}

fn build_detached_heads(val: Option<&Value>) -> Option<Value> {
    let mut map = Map::new();
    let heads = match val.and_then(|inner| inner["heads"].as_array()) {
        Some(arr) => arr
            .iter()
            .map(|item| Some(json!({"hash": item.as_str()?})))
            .collect::<Option<Vec<_>>>()?,
        None => Vec::new(),
    };
    let deleted = match val.and_then(|inner| inner["deleted"].as_array()) {
        Some(arr) => arr
            .iter()
            .map(|item| Some(json!({"hash": item.as_str()?})))
            .collect::<Option<Vec<_>>>()?,
        None => Vec::new(),
    };
    map.insert("heads".into(), Value::Array(heads));
    if let Some(curr) = val.and_then(|inner| inner["current"].as_str()) {
        map.insert("current".into(), json!({"hash": curr}));
    }
    map.insert("deleted".into(), Value::Array(deleted));
    Some(Value::Object(map))
}

pub(super) fn build_lane_json_obj(
    raw: &Value,
    scope: &str,
    name: &str,
    hash: &str,
    json_extra: bool,
) -> Option<Value> {
    if !raw["readmeComponent"].is_null()
        || !raw["updateDependents"].is_null()
        || !raw["overrideUpdateDependents"].is_null()
    {
        return None;
    }
    let comps = build_lane_components_json(raw.get("components"))?;
    let mut map = Map::new();
    map.insert("validateBeforePersist".into(), Value::Bool(true));
    map.insert("isNew".into(), Value::Bool(false));
    map.insert("hasChanged".into(), Value::Bool(false));
    map.insert("name".into(), Value::String(name.to_owned()));
    map.insert("scope".into(), Value::String(scope.to_owned()));
    map.insert("components".into(), Value::Array(comps));
    map.insert("log".into(), raw.get("log")?.clone());
    if let Some(ff) = raw
        .get("forkedFrom")
        .filter(|val| !val.is_null())
    {
        let (ff_scope, ff_name) = if let Some(raw_ff) = ff.as_str() {
            raw_ff
                .rsplit_once('@')
                .map_or(raw_ff, |(bare, _)| bare)
                .split_once('/')?
        } else {
            (ff["scope"].as_str()?, ff["name"].as_str()?)
        };
        map.insert("forkedFrom".into(), json!({ "name": ff_name, "scope": ff_scope }));
    }
    map.insert("_hash".into(), Value::String(hash.to_owned()));
    let schema = raw["schema"].as_str().unwrap_or("0.0.0");
    map.insert("schema".into(), Value::String(schema.to_owned()));
    if json_extra {
        map.insert("hash".into(), Value::String(hash.to_owned()));
        map.insert("type".into(), Value::String("Lane".into()));
    }
    Some(Value::Object(map))
}

fn build_lane_components_json(val: Option<&Value>) -> Option<Vec<Value>> {
    let Some(arr) = val.and_then(Value::as_array) else { return Some(Vec::new()) };
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        let (scope, name) = if let Some(raw) = item["id"].as_str() {
            raw.rsplit_once('@')
                .map_or(raw, |(bare, _)| bare)
                .split_once('/')?
        } else {
            (item["id"]["scope"].as_str()?, item["id"]["name"].as_str()?)
        };
        let mut comp = Map::new();
        comp.insert(
            "id".into(),
            json!({
                "_legacy": {
                    "scope": scope,
                    "name": name,
                    "version": "latest",
                }
            }),
        );
        comp.insert("head".into(), json!({ "hash": item["head"].as_str()? }));
        if let Some(del) = item
            .get("isDeleted")
            .filter(|val| !val.is_null())
        {
            comp.insert("isDeleted".into(), del.clone());
        }
        out.push(Value::Object(comp));
    }
    Some(out)
}
