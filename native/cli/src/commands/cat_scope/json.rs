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
    let lang = non_empty_str(&raw["lang"]).unwrap_or("javascript");
    map.insert("lang".into(), Value::String(lang.to_owned()));
    map.insert("deprecated".into(), Value::Bool(raw["deprecated"].as_bool().unwrap_or(false)));
    let binding_prefix = non_empty_str(&raw["bindingPrefix"])
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
    let head = non_empty_str(&raw["head"]);
    if let Some(head) = head {
        map.insert("head".into(), json!({"hash": head}));
    }
    let schema = non_empty_str(&raw["schema"])
        .unwrap_or_else(|| if head.is_some() { "1.0.0" } else { "0.0.0" });
    map.insert("schema".into(), Value::String(schema.to_owned()));
    map.insert("detachedHeads".into(), build_detached_heads(raw.get("detachedHeads"))?);
    if json_extra {
        map.insert("hash".into(), Value::String(hash.to_owned()));
        map.insert("type".into(), Value::String("ModelComponent".into()));
    }
    Some(Value::Object(map))
}

fn non_empty_str(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn split_scope_name(val: &Value) -> Option<(&str, &str)> {
    let (scope, name) = if let Some(raw) = non_empty_str(val) {
        raw.rsplit_once('@')
            .map_or(raw, |(bare, _)| bare)
            .split_once('/')?
    } else {
        (non_empty_str(&val["scope"])?, non_empty_str(&val["name"])?)
    };
    let (scope, name) = (scope.trim(), name.trim());
    (!scope.is_empty() && !name.is_empty()).then_some((scope, name))
}

fn map_ref_dict(val: Option<&Value>) -> Option<Value> {
    let mut out = Map::new();
    let Some(obj) = val.and_then(Value::as_object) else {
        return Some(Value::Object(out));
    };
    for (key, hash_val) in obj {
        let trimmed_key = key.trim();
        if trimmed_key.is_empty() {
            continue;
        }
        out.insert(trimmed_key.to_owned(), json!({"hash": non_empty_str(hash_val)?}));
    }
    Some(Value::Object(out))
}

fn build_detached_heads(val: Option<&Value>) -> Option<Value> {
    let mut map = Map::new();
    let heads = match val.and_then(|inner| inner["heads"].as_array()) {
        Some(arr) => arr
            .iter()
            .map(|item| Some(json!({"hash": non_empty_str(item)?})))
            .collect::<Option<Vec<_>>>()?,
        None => Vec::new(),
    };
    let deleted = match val.and_then(|inner| inner["deleted"].as_array()) {
        Some(arr) => arr
            .iter()
            .map(|item| Some(json!({"hash": non_empty_str(item)?})))
            .collect::<Option<Vec<_>>>()?,
        None => Vec::new(),
    };
    map.insert("heads".into(), Value::Array(heads));
    if let Some(curr) = val.and_then(|inner| non_empty_str(&inner["current"])) {
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
    let (scope, name, hash) = (scope.trim(), name.trim(), hash.trim());
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
        let (ff_scope, ff_name) = split_scope_name(ff)?;
        map.insert("forkedFrom".into(), json!({ "name": ff_name, "scope": ff_scope }));
    }
    map.insert("_hash".into(), Value::String(hash.to_owned()));
    let schema = non_empty_str(&raw["schema"]).unwrap_or("0.0.0");
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
        let (scope, name) = split_scope_name(&item["id"])?;
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
        comp.insert("head".into(), json!({ "hash": non_empty_str(&item["head"])? }));
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
