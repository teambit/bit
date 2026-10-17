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
pub(super) fn read(root: &Path) -> io::Result<Vec<Item>> {
    let file = match File::open(crate::scope_path(root).join("index.json")) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let bytes = Budget::new(4 * 1024 * 1024).read(file)?;
    let document: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
    let rows = if document.is_array() { &document } else { &document["components"] };
    let rows = rows.as_array().ok_or_else(|| invalid("status component index"))?;
    if rows.len() > 4096 {
        return Err(invalid("status component index count"));
    }
    let mut seen = HashSet::new();
    rows.iter()
        .map(|row| {
            let item: Item = serde_json::from_value(row.clone()).map_err(io::Error::other)?;
            if item.is_symlink || !seen.insert(item.hash.clone()) {
                return Err(invalid("status symlink or duplicate model"));
            }
            Ok(item)
        })
        .collect()
}
pub(super) fn model(reader: &Reader<'_>, item: &Item) -> io::Result<Value> {
    let value = reader.read(&item.hash, "Component")?;
    let scope = item.id.scope
        .as_deref()
        .filter(|scope| !scope.is_empty());
    let identity =
        scope.map_or_else(|| item.id.name.clone(), |scope| format!("{scope}/{}", item.id.name));
    let expected = crate::validate::hexadecimal(&Sha1::digest(identity.as_bytes()));
    if expected != item.hash
        || value["name"] != item.id.name
        || value
            .get("scope")
            .and_then(Value::as_str)
            .filter(|scope| !scope.is_empty())
            != scope
    {
        return Err(invalid("status model index identity mismatch"));
    }
    Ok(value)
}
