use super::{ASPECT, Plan, Value, invalid, selection};
use std::io;
pub(super) fn metadata(plan: &mut Plan, id: &str) -> io::Result<Value> {
    let key = selection::key(&plan.bitmap, id)?;
    let row = &plan.bitmap[key];
    if let Some(local) = local_aspect(row)
        && (local["deprecate"].is_boolean()
            || local["range"]
                .as_str()
                .is_some_and(|value| !value.is_empty()))
    {
        return Ok(local.clone());
    }
    if row["version"].as_str().is_none_or(str::is_empty)
        && key.rsplit_once('@').is_none_or(|(_, ver)| ver.is_empty())
    {
        return Ok(serde_json::json!({}));
    }
    model_metadata(plan, id)
}
fn local_aspect(row: &Value) -> Option<&Value> {
    row["config"]
        .as_object()
        .and_then(|cfg| {
            cfg.get(ASPECT)
                .or_else(|| {
                    cfg.iter()
                        .find_map(|(key, val)| {
                            key.starts_with(&format!("{ASPECT}@"))
                                .then_some(val)
                        })
                })
        })
}
fn model_metadata(plan: &mut Plan, id: &str) -> io::Result<Value> {
    let Some(hash) = model_hash(plan, id)? else {
        return Ok(serde_json::json!({}));
    };
    let model = read(plan, &hash)?;
    if model["deprecated"] == true {
        return Ok(serde_json::json!({"deprecate":true}));
    }
    let Some(ver_hash) = resolve_model_version(&model, id).or_else(|| model["head"].as_str())
    else {
        return Ok(serde_json::json!({}));
    };
    let version = read(plan, ver_hash)?;
    let mut config = version["extensions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| {
                    crate::workspace::engine::client_status::config::is_extension_aspect(
                        row, ASPECT,
                    )
                })
        })
        .map_or_else(
            || serde_json::json!({}),
            |row| {
                if row["config"].is_object()
                    && !row["config"].as_object().is_none_or(serde_json::Map::is_empty)
                {
                    row["config"].clone()
                } else {
                    row["data"].clone()
                }
            },
        );
    range_state(&mut config, id, &model);
    Ok(config)
}
fn resolve_model_version<'a>(model: &'a Value, id: &'a str) -> Option<&'a str> {
    let (_, ver) = id.rsplit_once('@')?;
    if matches!(ver, "" | "latest" | "head") {
        return model["head"]
            .as_str()
            .filter(|val| !val.is_empty());
    }
    model["versions"][ver]
        .as_str()
        .or_else(|| model["orphanedVersions"][ver].as_str())
        .or_else(|| (ver.len() == 40).then_some(ver))
}
fn model_hash(plan: &mut Plan, id: &str) -> io::Result<Option<String>> {
    let index_path = crate::scope_path(&plan.root).join("index.json");
    let bytes = plan.proofs.read(&index_path)?.ok_or_else(|| invalid("scope index missing"))?;
    let index: Value = serde_json::from_slice(&bytes)?;
    let bare = id.rsplit_once('@').map_or(id, |(bare_id, _)| bare_id);
    let found = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .and_then(|rows| rows.iter().find(|row| matches_indexed_component(row, bare)))
        .and_then(|row| row["hash"].as_str());
    Ok(found.map(str::to_owned))
}
fn matches_indexed_component(row: &Value, bare: &str) -> bool {
    let (scope_part, name_part) = bare
        .split_once('/')
        .unwrap_or(("", bare));
    let row_scope = row["id"]["scope"].as_str().unwrap_or_default();
    let row_name = row["id"]["name"].as_str().unwrap_or_default();
    row["isSymlink"] != true
        && ((row_name == name_part
            && (row_scope.is_empty() || scope_part.is_empty() || row_scope == scope_part))
            || format!("{row_scope}/{row_name}") == bare
            || row_name == bare)
}
fn read(plan: &mut Plan, hash: &str) -> io::Result<Value> {
    crate::merge_history::hash(hash)?;
    let scope = crate::scope_path(&plan.root);
    let path = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let _before = plan.proofs.read(&path)?.ok_or_else(|| invalid("deprecation model missing"))?;
    let (_, value) = crate::read_scope_object(&scope, hash)?
        .ok_or_else(|| invalid("deprecation model missing"))?;
    plan.proofs.read(&path)?;
    Ok(value)
}

fn range_state(config: &mut Value, id: &str, model: &Value) {
    if config["deprecate"] == true {
        return;
    }
    let Some(range) = config["range"]
        .as_str()
        .and_then(|range| node_semver::Range::parse(range).ok())
    else {
        return;
    };
    let Some(version) = id.rsplit_once('@').map(|(_, version)| version) else {
        return;
    };
    let tag = model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(|versions| versions.iter())
        .find(|(_, hash)| hash.as_str() == Some(version))
        .map_or(version, |(tag, _)| tag.as_str());
    if let Ok(version) = node_semver::Version::parse(tag) {
        config["deprecate"] = Value::Bool(range.satisfies(&version));
    }
}

pub(super) fn requires_hydration(bitmap: &Value, id: &str) -> io::Result<bool> {
    let key = selection::key(bitmap, id)?;
    let Some(local) = local_aspect(&bitmap[key]) else {
        return Ok(true);
    };
    Ok(!local["deprecate"].is_boolean() && local["range"].as_str().is_none_or(str::is_empty))
}
