//! Materialize a remote Version over an imported workspace component.
use super::{
    super::details, Replacement, Target, WorkspaceFiles, invalid, policy, safe_destination, version,
};
use crate::{checkout, command_import::PreparedImport};
use serde_json::{Map, Value};
use std::{borrow::Cow, collections::HashMap, fs, io, path::Path};

pub(super) struct Input<'a> {
    pub(super) root: &'a Path,
    pub(super) directory: &'a str,
    pub(super) target: &'a Target,
    pub(super) imported: &'a PreparedImport,
    pub(super) row: &'a Value,
    pub(super) policy: &'a HashMap<String, String>,
    pub(super) override_existing: bool,
}

pub(super) fn prepare(
    input: &Input<'_>,
    rows: &mut Map<String, Value>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    checkout::plan::relative_path(input.directory)?;
    let model = imported_model(input, rows)?;
    let (old, hash, name) = versions(input, model.as_ref())?;
    let local;
    let new = if let Some(version) = input.imported.overlay.read(&hash, "Version")? {
        version
    } else {
        local = details::local_object(input.root, &hash, "Version")?
            .ok_or_else(|| invalid("inbound existing Version"))?;
        &local
    };
    let main = validate_new(input, new)?;
    plan_files(input, &old, new, changes)?;
    let bitmap =
        rows.get_mut(&input.target.name).ok_or_else(|| invalid("inbound existing bitmap"))?;
    bitmap["version"] = Value::String(name);
    bitmap["mainFile"] = Value::String(main.to_owned());
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

fn versions(input: &Input<'_>, model: &Value) -> io::Result<(Value, String, String)> {
    let current =
        input.row["version"].as_str().ok_or_else(|| invalid("inbound existing version"))?;
    let (_, current_hash) = version(model, current)?;
    let old = details::local_object(input.root, &current_hash, "Version")?
        .ok_or_else(|| invalid("inbound existing local Version"))?;
    let (new_name, new_hash) = version(model, &input.target.version)?;
    Ok((old, new_hash, new_name))
}

fn validate_new<'a>(input: &Input<'_>, new: &'a Value) -> io::Result<&'a str> {
    crate::history_query::validate_version(new)?;
    policy::reject_update(new, input.policy)?;
    let main = new["mainFile"].as_str().ok_or_else(|| invalid("inbound existing main file"))?;
    checkout::plan::relative_path(main)?;
    Ok(main)
}

fn plan_files(
    input: &Input<'_>,
    old: &Value,
    new: &Value,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    let old_files = files(old)?;
    let new_files = files(new)?;
    plan_old(input, &old_files, &new_files, changes)?;
    plan_new(input, &old_files, &new_files, changes)
}

fn plan_old(
    input: &Input<'_>,
    old_files: &HashMap<String, String>,
    new_files: &HashMap<String, String>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    let mut compressed = 0;
    for (relative, old_hash) in old_files {
        let path = input.root.join(input.directory).join(relative);
        let old_source = checkout::repository::source(
            &input.root.join(".bit/objects"),
            crate::merge_history::hash(old_hash)?,
            32 * 1024 * 1024,
            &mut compressed,
        )?;
        let expected = checkout::eol::auto(old_source);
        let before = if input.override_existing {
            current_body(input.root, &path)?
        } else {
            check(input.root, &path, &expected)?;
            expected
        };
        if let Some(new_hash) = new_files.get(relative) {
            let after = new_source(input, new_hash)?;
            if before != after {
                changes.replacements.push(Replacement { path, before, after });
            }
        }
        // ComponentWriter leaves files removed by the new Version in the workspace.
    }
    Ok(())
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
        &input.root.join(".bit/objects"),
        crate::merge_history::hash(hash)?,
        32 * 1024 * 1024,
        &mut compressed,
    )?;
    Ok(checkout::eol::auto(source))
}

fn current_body(root: &Path, path: &Path) -> io::Result<Vec<u8>> {
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
