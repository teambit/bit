//! Materialize a remote Version over an imported workspace component.
use super::{
    super::details, Replacement, Target, WorkspaceFiles, invalid, safe_destination, version,
};
use crate::{checkout, command_import::PreparedImport};
use serde_json::{Map, Value};
use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    fs, io,
    path::Path,
};

pub(super) struct Input<'a> {
    pub(super) root: &'a Path,
    pub(super) directory: &'a str,
    pub(super) target: &'a Target,
    pub(super) imported: &'a PreparedImport,
    pub(super) row: &'a Value,
    pub(super) lane: Option<&'a Value>,
    pub(super) resolution: Resolution<'a>,
}

#[derive(Clone, Copy)]
pub(super) struct Resolution<'a> {
    pub(super) override_existing: bool,
    pub(super) merge_strategy: Option<&'a str>,
    pub(super) track_only: bool,
}

pub(super) fn prepare(
    input: &Input<'_>,
    rows: &mut Map<String, Value>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    checkout::plan::relative_path(input.directory)?;
    let model = imported_model(input, rows)?;
    let (old, hash, name) = if input.resolution.track_only {
        let (name, hash) = version(model.as_ref(), &input.target.version)?;
        (Value::Null, hash, name)
    } else {
        versions(input, model.as_ref())?
    };
    let local;
    let new = if let Some(version) = input.imported.overlay.read(&hash, "Version")? {
        version
    } else {
        local = details::local_object(input.root, &hash, "Version")?
            .ok_or_else(|| invalid("inbound existing Version"))?;
        &local
    };
    if super::requires_canonical_history_check(input.lane, input.target, model.as_ref(), &hash, new)
        || has_diverged_local_versions(input, model.as_ref())?
    {
        return Err(invalid("inbound lane snap requires canonical history check"));
    }
    let main = validate_new(new)?;
    if !input.resolution.track_only {
        plan_files(input, &old, new, &name, changes)?;
    }
    let bitmap =
        rows.get_mut(&input.target.name).ok_or_else(|| invalid("inbound existing bitmap"))?;
    bitmap["version"] = Value::String(name);
    bitmap["mainFile"] = Value::String(main.to_owned());
    reorder_bitmap(bitmap)?;
    Ok(())
}

// `ComponentMap.toPlainObject()` reconstructs every imported row, including authored rows.
fn reorder_bitmap(bitmap: &mut Value) -> io::Result<()> {
    let old = bitmap.as_object().ok_or_else(|| invalid("inbound bitmap row"))?;
    let mut reordered = Map::new();
    for key in [
        "name",
        "scope",
        "version",
        "files",
        "defaultScope",
        "mainFile",
        "rootDir",
        "wrapDir",
        "exported",
        "onLanesOnly",
        "isAvailableOnCurrentLane",
        "nextVersion",
        "localOnly",
        "config",
    ] {
        if let Some(value) = old.get(key) {
            reordered.insert(key.to_owned(), value.clone());
        }
    }
    if reordered.len() != old.len() {
        return Err(invalid("inbound bitmap row fields"));
    }
    *bitmap = Value::Object(reordered);
    Ok(())
}

fn imported_model<'a>(
    input: &'a Input<'_>,
    rows: &Map<String, Value>,
) -> io::Result<Cow<'a, Value>> {
    let scope = input.target.scope.as_deref().ok_or_else(|| invalid("inbound existing scope"))?;
    if input.row["scope"] != scope || rows.get(&input.target.name) != Some(input.row) {
        return Err(invalid("inbound existing workspace identity"));
    }
    details::model(input.root, input.imported, scope, &input.target.name)
}

fn has_diverged_local_versions(input: &Input<'_>, model: &Value) -> io::Result<bool> {
    let has_local = model["state"]["versions"]
        .as_object()
        .is_some_and(|versions| {
            versions
                .values()
                .any(|entry| entry["local"] == true)
        });
    if !has_local {
        return Ok(false);
    }
    if input.resolution.merge_strategy.is_some() {
        return Ok(true);
    }
    let Some(scope) = input.target.scope.as_deref() else { return Ok(false) };
    let Some(remote_head) = input.imported.overlay
        .refs(scope)
        .and_then(|rows| {
            rows.iter()
                .find(|row| {
                    row["id"]["scope"] == scope
                        && row["id"]["name"] == input.target.name
                })
        })
        .and_then(|row| row["head"].as_str())
    else {
        return Ok(false);
    };
    let Some(local_head) = model["head"].as_str() else { return Ok(false) };
    Ok(!is_ancestor_version(input, local_head, remote_head)?)
}

fn is_ancestor_version(input: &Input<'_>, start: &str, target: &str) -> io::Result<bool> {
    let mut stack = vec![start.to_owned()];
    let mut visited = HashSet::new();
    while let Some(cur) = stack.pop() {
        if cur == target {
            return Ok(true);
        }
        if visited.insert(cur.clone()) && visited.len() <= 4096 {
            stack.extend(version_parents(input, &cur)?);
        }
    }
    Ok(false)
}

fn version_parents(input: &Input<'_>, hash: &str) -> io::Result<Vec<String>> {
    let version = if let Some(ver) = details::local_object(input.root, hash, "Version")? {
        Some(ver)
    } else {
        input.imported.overlay.read(hash, "Version")?.cloned()
    };
    Ok(version
        .and_then(|ver| ver["parents"].as_array().cloned())
        .into_iter()
        .flatten()
        .filter_map(|val| val.as_str().map(String::from))
        .collect())
}

fn versions(input: &Input<'_>, model: &Value) -> io::Result<(Value, String, String)> {
    let current =
        input.row["version"].as_str().ok_or_else(|| invalid("inbound existing version"))?;
    let (_, current_hash) = version(model, current)?;
    let old = if let Some(version) = details::local_object(input.root, &current_hash, "Version")? {
        version
    } else {
        input.imported.overlay
            .read(&current_hash, "Version")?
            .ok_or_else(|| invalid("inbound existing Version"))?
            .clone()
    };
    let (new_name, new_hash) = version(model, &input.target.version)?;
    Ok((old, new_hash, new_name))
}

fn validate_new(new: &Value) -> io::Result<&str> {
    crate::history_query::validate_version(new)?;
    let main = new["mainFile"].as_str().ok_or_else(|| invalid("inbound existing main file"))?;
    checkout::plan::relative_path(main)?;
    Ok(main)
}

fn plan_files(
    input: &Input<'_>,
    old: &Value,
    new: &Value,
    incoming_version: &str,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    let old_files = files(old)?;
    let new_files = files(new)?;
    plan_old(input, &old_files, &new_files, incoming_version, changes)?;
    plan_new(input, &old_files, &new_files, changes)
}

fn plan_old(
    input: &Input<'_>,
    old_files: &HashMap<String, String>,
    new_files: &HashMap<String, String>,
    incoming_version: &str,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    let mut compressed = 0;
    let mut paths = old_files.keys().collect::<Vec<_>>();
    paths.sort();
    for relative in paths {
        let old_hash = &old_files[relative];
        plan_old_file(
            input,
            relative,
            old_hash,
            new_files.get(relative),
            incoming_version,
            changes,
            &mut compressed,
        )?;
    }
    Ok(())
}

fn plan_old_file(
    input: &Input<'_>,
    relative: &str,
    old_hash: &str,
    new_hash: Option<&String>,
    incoming_version: &str,
    changes: &mut WorkspaceFiles,
    compressed: &mut usize,
) -> io::Result<()> {
    let path = input.root.join(input.directory).join(relative);
    let expected = old_source(input, old_hash, compressed)?;
    let before = current_or_missing(input, &path, &expected)?;
    if let Some(hash) = new_hash {
        let after = new_source(input, hash)?;
        let (after, conflicted) = resolve(
            input,
            before.as_deref(),
            &expected,
            after,
            old_hash == hash,
            incoming_version,
        )?;
        if conflicted {
            let scope = input.target.scope.as_deref().ok_or_else(|| invalid("inbound scope"))?;
            changes.conflicts
                .entry(format!("{scope}/{}", input.target.name))
                .or_default()
                .push(relative.to_owned());
        }
        match before {
            Some(before) if before != after => {
                changes.replacements.push(Replacement { path, before, after });
            }
            None => changes.additions.push((path, after)),
            Some(_) => {}
        }
    }
    // ComponentWriter leaves files removed by the new Version in the workspace.
    Ok(())
}

fn resolve(
    input: &Input<'_>,
    before: Option<&[u8]>,
    base: &[u8],
    incoming: Vec<u8>,
    unchanged_source: bool,
    incoming_version: &str,
) -> io::Result<(Vec<u8>, bool)> {
    let Some(strategy) = input.resolution.merge_strategy else { return Ok((incoming, false)) };
    let Some(current) = before else { return Ok((incoming, false)) };
    if current == base || unchanged_source {
        return Ok((if unchanged_source { current.to_vec() } else { incoming }, false));
    }
    match strategy {
        "ours" => Ok((current.to_vec(), false)),
        "theirs" => Ok((incoming, false)),
        "manual" => {
            let current_version =
                input.row["version"].as_str().ok_or_else(|| invalid("inbound current version"))?;
            let labels = [format!("{current_version} modified"), incoming_version.to_owned()];
            let (merged, conflict) = crate::merge_history::merge::git::workspace_merge(
                current,
                base,
                &incoming,
                [&labels[0], &labels[1]],
            )?;
            Ok((merged, conflict))
        }
        _ => Err(invalid("inbound merge strategy")),
    }
}

fn old_source(input: &Input<'_>, hash: &str, compressed: &mut usize) -> io::Result<Vec<u8>> {
    if let Some(source) = input.imported.overlay.source(hash) {
        return Ok(checkout::eol::auto(source.to_vec()));
    }
    let source = checkout::repository::source(
        &crate::scope_path(input.root).join("objects"),
        crate::merge_history::hash(hash)?,
        32 * 1024 * 1024,
        compressed,
    )?;
    Ok(checkout::eol::auto(source))
}

fn current_or_missing(
    input: &Input<'_>,
    path: &Path,
    expected: &[u8],
) -> io::Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Ok(_)
            if input.resolution.override_existing
                || input.resolution.merge_strategy.is_some() =>
        {
            current_body(input.root, path).map(Some)
        }
        Ok(_) => {
            check(input.root, path, expected)?;
            Ok(Some(expected.to_vec()))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            safe_destination(input.root, path)?;
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

fn plan_new(
    input: &Input<'_>,
    old_files: &HashMap<String, String>,
    new_files: &HashMap<String, String>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    for (relative, hash) in new_files {
        if old_files.contains_key(relative) {
            continue;
        }
        let path = input.root.join(input.directory).join(relative);
        safe_destination(input.root, &path)?;
        changes.additions.push((path, new_source(input, hash)?));
    }
    Ok(())
}

fn new_source(input: &Input<'_>, hash: &str) -> io::Result<Vec<u8>> {
    if let Some(source) = input.imported.overlay.source(hash) {
        return Ok(checkout::eol::auto(source.to_vec()));
    }
    let mut compressed = 0;
    let source = checkout::repository::source(
        &crate::scope_path(input.root).join("objects"),
        crate::merge_history::hash(hash)?,
        32 * 1024 * 1024,
        &mut compressed,
    )?;
    Ok(checkout::eol::auto(source))
}

pub(super) fn current_body(root: &Path, path: &Path) -> io::Result<Vec<u8>> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > super::MAX_WRITTEN_BYTES as u64 {
        return Err(invalid("inbound override workspace file type or size"));
    }
    let body = fs::read(path)?;
    check(root, path, &body)?;
    Ok(body)
}

fn files(version: &Value) -> io::Result<HashMap<String, String>> {
    let rows = version["files"].as_array().ok_or_else(|| invalid("inbound existing files"))?;
    if rows.is_empty() || rows.len() > 4096 {
        return Err(invalid("inbound existing file count"));
    }
    let mut files = HashMap::new();
    for row in rows {
        let relative =
            row["relativePath"].as_str().ok_or_else(|| invalid("inbound existing file path"))?;
        checkout::plan::relative_path(relative)?;
        let hash = row["file"].as_str().ok_or_else(|| invalid("inbound existing Source"))?;
        crate::merge_history::hash(hash)?;
        if files.insert(relative.to_owned(), hash.to_owned()).is_some() {
            return Err(invalid("inbound duplicate existing file"));
        }
    }
    Ok(files)
}

pub(super) fn check(root: &Path, path: &Path, before: &[u8]) -> io::Result<()> {
    let relative = path.strip_prefix(root).map_err(io::Error::other)?;
    let mut current = root.to_owned();
    for part in relative.components() {
        current.push(part);
        let metadata = fs::symlink_metadata(&current)?;
        if current == path {
            if !metadata.is_file() || fs::read(&current)? != before {
                return Err(invalid("inbound existing workspace file changed"));
            }
        } else if !metadata.is_dir() {
            return Err(invalid("inbound existing workspace parent linked"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
