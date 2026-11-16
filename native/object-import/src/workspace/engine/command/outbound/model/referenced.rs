//! Ship the non-head snaps a squashed head still pins through its flattened dependencies ([`add`]).
//!
//! A lane merge that squashes drops snaps from a dependency's parent chain, yet another head can keep pinning one of them.
//! The remote's dependency-integrity check rejects that export unless the pinned snap travels with it, so it is added to
//! the dependency's [`Selected`] objects when every object it references exists locally.
use super::{Selected, collect, read_object};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};

/// A same-scope snap that a selected head pins: the dependency's `(scope, name)` and the snap hash.
type Pin = (String, String, String);

/// Add each pinned snap of a squashed dependency to its [`Selected`] objects when the snap and its references exist locally.
pub(super) fn add(objects_dir: &Path, selected: &mut [Selected]) -> io::Result<()> {
    let heads = heads(objects_dir, selected)?;
    let mut pins = Vec::new();
    for row in selected.iter() {
        if let Some(version) = heads.get(&row_key(row)) {
            pins.extend(pinned(objects_dir, row, version)?);
        }
    }
    for (scope, name, snap) in pins {
        let key = format!("{scope}/{name}");
        if heads
            .get(&key)
            .is_none_or(|version| version["squashed"].is_null())
        {
            continue;
        }
        if let Some(row) = selected
            .iter_mut()
            .find(|row| row_key(row) == key)
        {
            append(objects_dir, row, &snap);
        }
    }
    Ok(())
}

/// `Version` values (by `scope/name`) of the heads that are part of this export.
fn heads(objects_dir: &Path, selected: &[Selected]) -> io::Result<HashMap<String, Value>> {
    let mut heads = HashMap::new();
    for row in selected.iter().filter(|row| has_object(row, &row.head)) {
        heads.insert(row_key(row), read_object(objects_dir, &row.head, "Version")?);
    }
    Ok(heads)
}

fn row_key(row: &Selected) -> String {
    format!("{}/{}", row.scope, row.name)
}

fn has_object(row: &Selected, hash: &str) -> bool {
    row.objects
        .iter()
        .any(|item| item.hash == hash)
}

/// Same-scope snap pins in `version`'s flattened dependencies.
fn pinned(objects_dir: &Path, row: &Selected, version: &Value) -> io::Result<Vec<Pin>> {
    let mut pins = Vec::new();
    for dependency in flattened(objects_dir, version)? {
        let Some((scope, name, ver)) = parse_dependency(&dependency) else { continue };
        if scope == row.scope && crate::merge_history::hash(&ver).is_ok() {
            pins.push((scope, name, ver));
        }
    }
    Ok(pins)
}

fn flattened(objects_dir: &Path, version: &Value) -> io::Result<Vec<Value>> {
    let mut rows = match (
        version["flattenedDependencies"].as_array(),
        version["flattenedDependenciesRef"].as_str(),
    ) {
        (Some(rows), _) if !rows.is_empty() => rows.clone(),
        (_, Some(hash)) => match read_object(objects_dir, hash, "Source")? {
            Value::Array(rows) => rows,
            _ => Vec::new(),
        },
        (rows, None) => rows.cloned().unwrap_or_default(),
    };
    rows.extend(
        version["flattenedDevDependencies"]
            .as_array()
            .cloned()
            .unwrap_or_default(),
    );
    Ok(rows)
}

fn parse_dependency(value: &Value) -> Option<(String, String, String)> {
    let id = value
        .get("id")
        .filter(|id| !id.is_null())
        .unwrap_or(value);
    if let Some(text) = id.as_str() {
        let (identity, version) = text.trim().rsplit_once('@')?;
        let (scope, name) = identity.split_once('/')?;
        return Some((scope.trim().into(), name.trim().into(), version.trim().into()));
    }
    let field = |key: &str| {
        id[key]
            .as_str()
            .map(|text| text.trim().to_owned())
    };
    Some((field("scope")?, field("name")?, field("version")?))
}

/// Append the snap `hash` objects to `row` when the snap exists locally and is not already part of the export.
fn append(objects_dir: &Path, row: &mut Selected, hash: &str) {
    if has_object(row, hash) {
        return;
    }
    let Ok(items) =
        collect(objects_dir, &row.model.hash, &row.model.after, &[hash.to_owned()], false)
    else {
        return;
    };
    let present: HashSet<String> = row.objects
        .iter()
        .map(|item| item.hash.clone())
        .collect();
    row.objects.extend(
        items
            .into_iter()
            .filter(|item| !present.contains(&item.hash)),
    );
}
