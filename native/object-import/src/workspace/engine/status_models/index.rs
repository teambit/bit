use super::{Reader, invalid};
use crate::read_budget::Budget;
use serde::Deserialize;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{collections::HashSet, fs::File, io, path::Path};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Item {
    id: Id,
    is_symlink: bool,
    hash: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Id {
    scope: Option<String>,
    name: String,
}
/// The scope's component index. A scope that never stored a component has
/// none, which `ComponentsIndex` reads as empty.
#[inline]
pub(super) fn read(root: &Path) -> io::Result<Vec<Item>> {
    read_at(&crate::scope_path(root))
}
pub(super) fn read_at(scope: &Path) -> io::Result<Vec<Item>> {
    let file = match File::open(scope.join("index.json")) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let bytes = Budget::new(4 * 1024 * 1024).read(file)?;
    let document: Value = crate::parse_jsonc(&bytes).map_err(io::Error::other)?;
    let rows = if document.is_array() { &document } else { &document["components"] };
    let rows = rows.as_array().ok_or_else(|| invalid("status component index"))?;
    if rows.len() > 4096 {
        return Err(invalid("status component index count"));
    }
    parse_items(rows)
}

#[inline]
fn parse_items(rows: &[Value]) -> io::Result<Vec<Item>> {
    let mut seen = HashSet::with_capacity(rows.len());
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let item: Item = serde_json::from_value(row.clone()).map_err(io::Error::other)?;
        if item.is_symlink {
            continue;
        }
        let Ok(raw_hash) = crate::merge_history::hash(item.hash.trim()) else {
            return Err(invalid("status symlink or duplicate model"));
        };
        if item.id.name.trim().is_empty() || !seen.insert(raw_hash) {
            return Err(invalid("status symlink or duplicate model"));
        }
        items.push(item);
    }
    Ok(items)
}
pub(super) fn model(reader: &Reader<'_>, item: &Item) -> io::Result<Value> {
    let hash = item.hash.trim();
    let name = item.id.name.trim();
    let value = reader.read(hash, "Component")?;
    let scope = item.id.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty());
    if scope.is_some_and(|part| part.contains('/')) {
        return Err(invalid("status indexed model identity"));
    }
    let mut digest = Sha1::new();
    if let Some(scope) = scope {
        digest.update(scope.as_bytes());
        digest.update(b"/");
    }
    digest.update(name.as_bytes());
    let expected = crate::validate::hexadecimal(&digest.finalize());
    if !expected.eq_ignore_ascii_case(hash)
        || value["name"].as_str().map(str::trim) != Some(name)
        || value
            .get("scope")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            != scope
    {
        return Err(invalid("status model index identity mismatch"));
    }
    Ok(value)
}
