use super::{ASPECT, Plan, Value, invalid, selection};
use std::io;
pub(super) fn metadata(plan: &mut Plan, id: &str) -> io::Result<Value> {
    let key = selection::key(&plan.bitmap, id)?;
    let row = &plan.bitmap[key];
    let local = &row["config"][ASPECT];
    if local["deprecate"].is_boolean()
        || local["range"]
            .as_str()
            .is_some_and(|value| !value.is_empty())
    {
        return Ok(local.clone());
    }
    if row["version"].as_str().is_none_or(str::is_empty) {
        return Ok(serde_json::json!({}));
    }
    model_metadata(plan, id)
}
fn model_metadata(plan: &mut Plan, id: &str) -> io::Result<Value> {
    let Some(hash) = model_hash(plan, id)? else {
        return Ok(serde_json::json!({}));
    };
    let model = read(plan, &hash)?;
    if model["deprecated"] == true {
        return Ok(serde_json::json!({"deprecate":true}));
    }
    let Some(head) = model["head"].as_str() else {
        return Ok(serde_json::json!({}));
    };
    let version = read(plan, head)?;
    let mut config = version["extensions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["name"] == ASPECT)
        })
        .map_or_else(|| serde_json::json!({}), |row| row["config"].clone());
    range_state(&mut config, id, &model);
    Ok(config)
}
fn model_hash(plan: &mut Plan, id: &str) -> io::Result<Option<String>> {
    let scope = crate::scope_path(&plan.root);
    let index_path = scope.join("index.json");
    let bytes = plan.proofs.read(&index_path)?.ok_or_else(|| invalid("scope index missing"))?;
    let index: Value = serde_json::from_slice(&bytes)?;
    let bare = id.split('@').next().unwrap_or(id);
    let model_hash = index["components"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| {
                    format!(
                        "{}/{}",
                        row["id"]["scope"].as_str().unwrap_or_default(),
                        row["id"]["name"].as_str().unwrap_or_default(),
                    ) == bare
                })
        })
        .and_then(|row| row["hash"].as_str());
    Ok(model_hash.map(str::to_owned))
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
    let Some(version) = id.rsplit_once('@').map(|(_, version)| version) else { return };
    let tag = model["versions"]
        .as_object()
        .and_then(|versions| {
            versions
                .iter()
                .find(|(_, hash)| hash.as_str() == Some(version))
        })
        .map_or(version, |(tag, _)| tag.as_str());
    if let Ok(version) = node_semver::Version::parse(tag) {
        config["deprecate"] = Value::Bool(range.satisfies(&version));
    }
}

pub(super) fn requires_hydration(bitmap: &Value, id: &str) -> io::Result<bool> {
    let key = selection::key(bitmap, id)?;
    let local = &bitmap[key]["config"][ASPECT];
    Ok(!local["deprecate"].is_boolean() && local["range"].as_str().is_none_or(str::is_empty))
}
