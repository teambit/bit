use super::{Batch, REMOVE, Value, invalid, repository};
use std::io;
pub(super) fn identity(key: &str, row: &Value) -> Option<String> {
    let name = row["name"].as_str().unwrap_or(key);
    let scope = row["scope"]
        .as_str()
        .filter(|value| !value.is_empty())
        .or_else(|| row["defaultScope"].as_str())?;
    let version = row["version"]
        .as_str()
        .filter(|version| !version.is_empty());
    Some(format!(
        "{scope}/{name}{}",
        version.map_or_else(String::new, |version| format!("@{version}")),
    ))
}
pub(super) fn key(bitmap: &Value, id: &str) -> io::Result<Option<String>> {
    let bare = bare(id);
    let rows = bitmap.as_object().ok_or_else(|| invalid("recovery bitmap object"))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|(key, row)| {
            identity(key, row)
                .is_some_and(|full| {
                    self::bare(&full) == bare || row["name"] == bare || key.as_str() == bare
                })
        })
        .collect();
    if matches.len() > 1 {
        return Err(invalid("ambiguous recovery component identity"));
    }
    Ok(matches.first().map(|(key, _)| (*key).clone()))
}
pub(super) fn bare(id: &str) -> &str {
    id.split('@').next().unwrap_or(id)
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
            && row["config"][REMOVE]["removed"] != true
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
        if row["config"][REMOVE]["removed"] == true {
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
    let index = repository::index(batch)?;
    let rows: Vec<_> = index["components"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row| {
            row["id"]["name"] == bare(pattern)
                || format!(
                    "{}/{}",
                    row["id"]["scope"].as_str().unwrap_or_default(),
                    row["id"]["name"].as_str().unwrap_or_default(),
                ) == bare(pattern)
        })
        .collect();
    if rows.len() == 1 {
        let row = rows[0];
        return Ok(vec![format!(
            "{}/{}",
            row["id"]["scope"].as_str().unwrap_or_default(),
            row["id"]["name"].as_str().unwrap_or_default(),
        )]);
    }
    if !pattern.contains('/') {
        return Err(invalid(format!("component {pattern} was not found")));
    }
    Ok(vec![pattern.into()])
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
        let bare = format!(
            "{}/{}",
            row["id"]["scope"].as_str().unwrap_or_default(),
            row["id"]["name"].as_str().unwrap_or_default(),
        );
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
    let rows: Value = serde_json::from_slice(&bytes)?;
    for row in rows.as_array().ok_or_else(|| invalid("recovery staged configuration"))? {
        if row["config"][REMOVE]["removed"] != true {
            continue;
        }
        append(
            result,
            format!(
                "{}/{}",
                row["id"]["scope"].as_str().unwrap_or_default(),
                row["id"]["name"].as_str().unwrap_or_default(),
            ),
        );
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
