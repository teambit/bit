use super::{Batch, Value, invalid, repository};
use std::io;
pub(super) fn identity(key: &str, row: &Value) -> Option<String> {
    if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
        return None;
    }
    let key = key.trim();
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
                .strip_prefix(&format!("{scope}/"))
                .unwrap_or(key_id)
                .trim()
        });
    let version = non_empty_field(row, "version")
        .filter(|version| !matches!(*version, "latest" | "head"))
        .or_else(|| {
            key_ver.filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
        });
    Some(format!(
        "{scope}/{name}{}",
        version.map_or_else(String::new, |version| format!("@{version}")),
    ))
}
fn non_empty_field<'a>(row: &'a Value, field: &str) -> Option<&'a str> {
    row[field]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}
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
pub(super) fn bare(id: &str) -> &str {
    let id = id.trim();
    id.split('@')
        .next()
        .map_or(id, str::trim)
}
pub(super) fn select(batch: &mut Batch, pattern: &str) -> io::Result<Vec<String>> {
    if !pattern.contains(['*', '?']) {
        return single(batch, pattern);
    }
    let mut result = bitmap_pool(batch)?;
    staged(batch, &mut result)?;
    result.retain(|id| {
        bit_workspace_config::glob::matches(pattern, bare(id))
            || bare(id)
                .split_once('/')
                .is_some_and(|(_, name)| bit_workspace_config::glob::matches(pattern, name))
    });
    Ok(result)
}
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
            row_name == bare(pattern) || format!("{row_scope}/{row_name}") == bare(pattern)
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
    let rows: Vec<_> = lane["components"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row| {
            let (row_scope, row_name) = repository::row_id_parts(&row["id"]);
            row_name == bare(pattern) || format!("{row_scope}/{row_name}") == bare(pattern)
        })
        .collect();
    if rows.len() > 1 {
        return Err(invalid("ambiguous recovery component identity"));
    }
    let Some(row) = rows.first() else { return Ok(None) };
    let (row_scope, row_name) = repository::row_id_parts(&row["id"]);
    let bare = format!("{row_scope}/{row_name}");
    let version = pattern
        .split_once('@')
        .map(|(_, version)| version)
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
        .or_else(|| row["head"].as_str())
        .ok_or_else(|| invalid("recovery lane head"))?;
    Ok(Some(format!("{bare}@{version}")))
}
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
fn append(result: &mut Vec<String>, id: String) {
    if !result
        .iter()
        .any(|existing| existing == &id)
    {
        result.push(id);
    }
}
