//! Component [`identity`] extraction and pattern selection across `.bitmap` and local scope index.

use super::{Batch, Value, invalid, repository};
use std::io;
/// Extracts the canonical scoped component ID (with optional version) from a `.bitmap` row.
pub(super) fn identity(key: &str, row: &Value) -> Option<String> {
    let key = key.trim();
    if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
        return None;
    }
    let (key_id, key_ver) = key
        .rsplit_once('@')
        .map_or((key, None), |(id, ver)| (id.trim(), Some(ver.trim())));
    let key_scope = key_id
        .split_once('/')
        .map(|(scope, _)| scope.trim())
        .filter(|scope| !scope.is_empty());
    let scope = non_empty_field(row, "scope")
        .or_else(|| non_empty_field(row, "defaultScope"))
        .or(key_scope)?;
    let name = non_empty_field(row, "name")
        .unwrap_or_else(|| {
            key_id
                .strip_prefix(scope)
                .and_then(|rest| rest.strip_prefix('/'))
                .unwrap_or(key_id)
                .trim()
        });
    if name.is_empty() {
        return None;
    }
    let version = non_empty_field(row, "version")
        .or_else(|| key_ver.filter(|ver| !ver.is_empty()))
        .filter(|version| !matches!(*version, "latest" | "head"));
    Some(match version {
        Some(version) => format!("{scope}/{name}@{version}"),
        None => format!("{scope}/{name}"),
    })
}
/// Extract a trimmed non-empty string field `field` from a `.bitmap` component `row`.
#[inline]
fn non_empty_field<'a>(row: &'a Value, field: &str) -> Option<&'a str> {
    row[field]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}
/// Locate the `.bitmap` key matching `id` by full identity, bare name, or key prefix.
pub(super) fn key(bitmap: &Value, id: &str) -> io::Result<Option<String>> {
    let bare = bare(id);
    let rows = bitmap.as_object().ok_or_else(|| invalid("recovery bitmap object"))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|(key, row)| {
            identity(key, row)
                .is_some_and(|full| {
                    let (_, name) = crate::reset_lane::bitmap::row_identity(key, row);
                    self::bare(&full) == bare || name == bare || self::bare(key) == bare
                })
        })
        .collect();
    if matches.len() > 1 {
        return Err(invalid("ambiguous recovery component identity"));
    }
    Ok(matches.first().map(|(key, _)| (*key).clone()))
}
/// Strip any `@version` suffix from `id` and return the trimmed bare component identity.
#[inline]
pub(super) fn bare(id: &str) -> &str {
    let id = id.trim();
    id.rsplit_once('@').map_or(id, |(bare, _)| bare.trim())
}
/// Select component identities from `.bitmap` and local scope index matching `pattern`.
pub(super) fn select(batch: &mut Batch, pattern: &str) -> io::Result<Vec<String>> {
    if !pattern.contains(['*', '?']) {
        return single(batch, pattern);
    }
    let mut result = bitmap_pool(batch)?;
    staged(batch, &mut result)?;
    result.retain(|id| {
        let bare_id = bare(id);
        bit_workspace_config::glob::matches(pattern, bare_id)
            || bare_id
                .split_once('/')
                .is_some_and(|(_, name)| bit_workspace_config::glob::matches(pattern, name))
    });
    Ok(result)
}
/// Collect component [`identity`] strings from `.bitmap` that are soft-removed in `.bitmap` or at their local head.
fn bitmap_pool(batch: &mut Batch) -> io::Result<Vec<String>> {
    let rows = batch.bitmap
        .as_object()
        .ok_or_else(|| invalid("recovery bitmap object"))?
        .clone();
    let mut result = vec![];
    removed_bitmap_rows(&rows, &mut result);
    for (key, row) in &rows {
        let Some(id) = identity(key, row) else { continue };
        if row["isAvailableOnCurrentLane"] != false
            && !crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
            && removed_head(batch, &id)?
        {
            append(&mut result, id);
        }
    }
    Ok(result)
}
#[inline]
fn removed_bitmap_rows(rows: &serde_json::Map<String, Value>, result: &mut Vec<String>) {
    for (key, row) in rows {
        if row["isAvailableOnCurrentLane"] == false {
            continue;
        }
        let Some(id) = identity(key, row) else { continue };
        if crate::workspace::engine::client_status::config::is_config_removed(&row["config"]) {
            append(result, id);
        }
    }
}
fn single(batch: &mut Batch, pattern: &str) -> io::Result<Vec<String>> {
    if let Some(key) = key(&batch.bitmap, pattern)? {
        return Ok(vec![
            identity(&key, &batch.bitmap[&key]).ok_or_else(|| invalid("recovery identity"))?,
        ]);
    }
    if let Some(id) = lane_component(batch, pattern)? {
        return Ok(vec![id]);
    }
    let index = repository::index(batch)?;
    let target = bare(pattern);
    let rows: Vec<_> = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .into_iter()
        .flatten()
        .filter(|row| {
            if row["isSymlink"] == true {
                return false;
            }
            let (row_scope, row_name) = repository::row_id_parts(&row["id"]);
            row_name == target || format!("{row_scope}/{row_name}") == target
        })
        .collect();
    if rows.len() == 1 {
        let (row_scope, row_name) = repository::row_id_parts(&rows[0]["id"]);
        return Ok(vec![format!("{row_scope}/{row_name}")]);
    }
    if !pattern.contains('/') {
        return Err(invalid(format!("component {pattern} was not found")));
    }
    Ok(vec![pattern.into()])
}
fn lane_component(batch: &mut Batch, pattern: &str) -> io::Result<Option<String>> {
    let Some(lane) = repository::lane(batch)? else { return Ok(None) };
    let target = bare(pattern);
    let rows: Vec<_> = lane["components"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row| {
            let (row_scope, row_name) = repository::row_id_parts(&row["id"]);
            row_name == target || format!("{row_scope}/{row_name}") == target
        })
        .collect();
    if rows.len() > 1 {
        return Err(invalid("ambiguous recovery component identity"));
    }
    let Some(row) = rows.first() else { return Ok(None) };
    let (row_scope, row_name) = repository::row_id_parts(&row["id"]);
    let bare = format!("{row_scope}/{row_name}");
    let version = pattern
        .trim()
        .rsplit_once('@')
        .map(|(_, version)| version.trim())
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
        .or_else(|| {
            row["head"]
                .as_str()
                .map(str::trim)
                .filter(|head| !head.is_empty())
        })
        .ok_or_else(|| invalid("recovery lane head"))?;
    Ok(Some(format!("{bare}@{version}")))
}
#[inline]
fn removed_head(batch: &mut Batch, id: &str) -> io::Result<bool> {
    let Some(model) = repository::model(batch, bare(id))? else { return Ok(false) };
    let Some(head) = repository::head(batch, bare(id), &model)? else { return Ok(false) };
    let Some(version) = repository::object(batch, &head, "Version")? else { return Ok(false) };
    Ok(repository::removal(&version)["removed"] == true)
}
fn staged(batch: &mut Batch, result: &mut Vec<String>) -> io::Result<()> {
    let Some(lane) = repository::lane(batch)? else { return staged_main(batch, result) };
    for row in lane["components"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let (row_scope, row_name) = repository::row_id_parts(&row["id"]);
        let bare = format!("{row_scope}/{row_name}");
        if key(&batch.bitmap, &bare)?.is_some() || !removed_head(batch, &bare)? {
            continue;
        }
        let head = row["head"].as_str().ok_or_else(|| invalid("recovery lane head"))?;
        append(result, format!("{bare}@{head}"));
    }
    Ok(())
}
fn staged_main(batch: &mut Batch, result: &mut Vec<String>) -> io::Result<()> {
    let path = crate::scope_path(&batch.root).join("staged-config/main.json");
    let Some(bytes) = batch.proofs.read(&path)? else { return Ok(()) };
    let rows: Value = crate::parse_jsonc(&bytes)?;
    for row in rows.as_array().ok_or_else(|| invalid("recovery staged configuration"))? {
        if !crate::workspace::engine::client_status::config::is_config_removed(&row["config"]) {
            continue;
        }
        let (row_scope, row_name) = repository::row_id_parts(&row["id"]);
        append(result, format!("{row_scope}/{row_name}"));
    }
    Ok(())
}
#[inline]
fn append(result: &mut Vec<String>, id: String) {
    if !result
        .iter()
        .any(|existing| existing == &id)
    {
        result.push(id);
    }
}
