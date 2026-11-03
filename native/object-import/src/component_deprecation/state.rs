//! Local `.bitmap` and model [`metadata`] inspection for component deprecation [`Plan`] state.

use super::{ASPECT, Plan, Value, invalid, selection};
use std::io;
/// Resolves the effective deprecation aspect metadata for component `id` from `.bitmap` or scope.
pub(super) fn metadata(plan: &mut Plan, id: &str) -> io::Result<Value> {
    let key = selection::key(&plan.bitmap, id)?;
    let row = &plan.bitmap[key];
    if let Some(local) = local_aspect(row)
        && (local["deprecate"].is_boolean()
            || local["range"]
                .as_str()
                .is_some_and(|value| !value.trim().is_empty()))
    {
        return Ok(local.clone());
    }
    if row["version"]
        .as_str()
        .is_none_or(|ver| ver.trim().is_empty())
        && key
            .rsplit_once('@')
            .is_none_or(|(_, ver)| ver.trim().is_empty())
    {
        return Ok(serde_json::json!({}));
    }
    model_metadata(plan, id)
}
/// Look up the [`ASPECT`] (`teambit.component/deprecation`) entry in a `.bitmap` row's `config` object.
#[inline]
fn local_aspect(row: &Value) -> Option<&Value> {
    let cfg = row["config"].as_object()?;
    cfg.get(ASPECT)
        .or_else(|| {
            cfg.iter()
                .find_map(|(key, val)| {
                    key.strip_prefix(ASPECT)
                        .is_some_and(|rest| rest.starts_with('@'))
                        .then_some(val)
                })
        })
}
/// Read deprecation aspect metadata for `id` from its stored `Component` and `Version` objects.
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
                if row["config"]
                    .as_object()
                    .is_some_and(|cfg| !cfg.is_empty())
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
/// Resolve the version hash for component `id` from `model` (`head`, `versions`, `orphanedVersions`, or raw SHA-1).
fn resolve_model_version<'a>(model: &'a Value, id: &'a str) -> Option<&'a str> {
    let (_, raw_ver) = id.rsplit_once('@')?;
    let ver = raw_ver.trim();
    if matches!(ver, "" | "latest" | "head") {
        return non_empty_str(&model["head"]);
    }
    non_empty_str(&model["versions"][ver])
        .or_else(|| non_empty_str(&model["orphanedVersions"][ver]))
        .or_else(|| {
            (ver.len() == 40 && ver.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(ver)
        })
}

/// Extract a trimmed non-empty string slice from a JSON [`Value`].
#[inline]
fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}
fn model_hash(plan: &mut Plan, id: &str) -> io::Result<Option<String>> {
    let index_path = crate::scope_path(&plan.root).join("index.json");
    let bytes = plan.proofs.read(&index_path)?.ok_or_else(|| invalid("scope index missing"))?;
    let index: Value = crate::parse_jsonc(&bytes)?;
    let trimmed = id.trim();
    let bare = trimmed.rsplit_once('@').map_or(trimmed, |(bare_id, _)| bare_id.trim());
    let found = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .and_then(|rows| rows.iter().find(|row| matches_indexed_component(row, bare)))
        .and_then(|row| non_empty_str(&row["hash"]));
    Ok(found.map(str::to_owned))
}
#[inline]
fn matches_indexed_component(row: &Value, bare: &str) -> bool {
    let bare = bare.trim();
    let (scope_part, name_part) = bare
        .split_once('/')
        .map_or(("", bare), |(sc, nm)| (sc.trim(), nm.trim()));
    let (row_scope, row_name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
            .map_or(("", ""), |(sc, nm)| (sc.unwrap_or_default().trim(), nm.trim()));
    row["isSymlink"] != true
        && ((row_name == name_part
            && (row_scope.is_empty() || scope_part.is_empty() || row_scope == scope_part))
            || bare
                .strip_prefix(row_scope)
                .and_then(|rest| rest.strip_prefix('/'))
                == Some(row_name)
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
        .map(str::trim)
        .and_then(|range| node_semver::Range::parse(range).ok())
    else {
        return;
    };
    let Some(version) = id.rsplit_once('@').map(|(_, version)| version.trim()) else {
        return;
    };
    let tag = model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(|versions| versions.iter())
        .find(|(_, hash)| hash.as_str().map(str::trim) == Some(version))
        .map_or(version, |(tag, _)| tag.trim());
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
