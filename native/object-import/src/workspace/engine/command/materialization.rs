mod license;
mod root;

use super::{super::invalid, capture::Captured, input::Options, repository::Repository};
use crate::{checkout_transition, workspace::snapshots};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) struct Prepared {
    pub(super) output: Value,
    pub(super) version: Value,
    pub(super) version_name: String,
    pub(super) keep_ours: bool,
    pub(super) has_conflicts: bool,
    pub(super) files: Vec<Value>,
    writes: Writes,
}
struct Writes {
    request: Value,
    removals: Vec<String>,
    license: Option<license::Prepared>,
}
pub(super) struct Input<'a> {
    pub(super) root: &'a Path,
    pub(super) directory: &'a Path,
    pub(super) current: &'a Captured,
    pub(super) version: &'a Value,
    pub(super) reference: &'a str,
    pub(super) selection: &'a Value,
    pub(super) base: Option<(&'a str, &'a Value)>,
    pub(super) options: &'a Options,
}
pub(super) fn prepare(
    input: &Input<'_>,
    repository: &Repository,
    state: &mut checkout_transition::State,
    snapshots: &snapshots::State,
) -> io::Result<Prepared> {
    if input.version["files"].as_array().is_none_or(Vec::is_empty) {
        return Err(invalid("command checkout target has no files"));
    }
    let workspace_root = input.current.target.directory == ".";
    let request = transition_request(input)?;
    let plan = match repository.overlay() {
        Some(overlay) => {
            checkout_transition::prepare_with_overlay(&request, state, Some(snapshots), overlay)?
        }
        None => checkout_transition::prepare_with_workspace(&request, state, snapshots)?,
    };
    if plan["hasConflicts"] == true && input.options.strategy.is_none() {
        return Err(super::super::response::canonical(format!(
            "automatic merge has failed for component {}.\nplease use \"--auto-merge-resolve\" with 'manual', 'ours' or 'theirs' to resolve the conflict/s",
            input.current.target.identity,
        )));
    }
    let applied = checkout_transition::apply(
        "checkoutApply",
        json!({
            "token":plan["token"],"strategy":input.options.strategy,"forceOurs":input.options.force_ours,
            "currentExists":!input.current.added,"tracked":!input.current.added,"workspaceRoot":workspace_root,
        }),
        state,
    )?;
    finish_with_license(input, &plan, &applied, repository)
}
fn finish_with_license(
    input: &Input<'_>,
    plan: &Value,
    applied: &Value,
    repository: &Repository,
) -> io::Result<Prepared> {
    let mut prepared = finish(input, plan, applied)?;
    if !prepared.keep_ours {
        prepared.writes.license =
            license::prepare(input, repository.checkout_license(&input.current.target.identity))?;
    }
    Ok(prepared)
}

fn finish(input: &Input<'_>, plan: &Value, applied: &Value) -> io::Result<Prepared> {
    if applied.get("deferredError").is_some() {
        return Err(invalid("command deferred apply failure"));
    }
    let directory = input.root.join(&input.current.target.directory);
    let files = destinations(applied, &directory)?;
    let statuses = statuses(applied)?;
    let version_name = input.selection["version"]
        .as_str()
        .ok_or_else(|| invalid("command selected version"))?
        .to_owned();
    let removals = applied["removals"]
        .as_array()
        .ok_or_else(|| invalid("command removals"))?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("command removal path"))
        })
        .collect::<io::Result<_>>()?;
    Ok(Prepared {
        output: json!({"id":format!("{}@{version_name}",input.current.target.identity),"filesStatus":statuses}),
        version: input.version.clone(),
        version_name,
        keep_ours: applied["keepOurs"] == true,
        has_conflicts: plan["hasConflicts"] == true,
        files: retained_files(plan, applied)?,
        writes: Writes {
            request: json!({"token":plan["token"],"files":files}),
            removals,
            license: None,
        },
    })
}

fn retained_files(plan: &Value, applied: &Value) -> io::Result<Vec<Value>> {
    let bodies = plan["bodies"].as_array().ok_or_else(|| invalid("command retained bodies"))?;
    applied["files"]
        .as_array()
        .ok_or_else(|| invalid("command retained files"))?
        .iter()
        .map(|file| {
            let index = file["planIndex"]
                .as_u64()
                .and_then(|index| usize::try_from(index).ok())
                .ok_or_else(|| invalid("command retained body index"))?;
            let source =
                bodies.get(index).ok_or_else(|| invalid("command retained body missing"))?;
            Ok(json!({"relativePath":file["relativePath"],"source":source}))
        })
        .collect()
}
pub(super) fn remove(plan: &Prepared) -> io::Result<()> {
    for path in &plan.writes.removals {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}
pub(super) fn write(plan: &Prepared, state: &mut checkout_transition::State) -> io::Result<()> {
    let result =
        checkout_transition::apply("checkoutMaterialize", plan.writes.request.clone(), state)?;
    if result["failed"] != false || !result["skipped"].as_array().is_some_and(Vec::is_empty) {
        return Err(io::Error::other("native command materialization failed"));
    }
    if let Some(license) = &plan.writes.license {
        license.commit()?;
    }
    Ok(())
}
fn manifest(hash: &str, version: &Value) -> io::Result<Value> {
    crate::history_query::validate_version(version)?;
    super::super::status_models::harmony::validate(version)?;
    let files = version["files"].as_array().ok_or_else(|| invalid("command Version files"))?;
    let files = files
        .iter()
        .map(|file| {
            let mut value = json!({"hash":file["file"],"relativePath":file["relativePath"]});
            for key in ["name", "test"] {
                if let Some(field) = file.get(key) {
                    value[key] = field.clone();
                }
            }
            value
        })
        .collect::<Vec<_>>();
    Ok(json!({"hash":hash,"files":files}))
}

pub(super) fn validate(plan: &Prepared, root: &Path) -> io::Result<()> {
    if let Some(license) = &plan.writes.license {
        license.validate(root)?;
    }
    for removal in &plan.writes.removals {
        validate_path(Path::new(removal), root)?;
    }
    for row in plan.writes.request["files"]
        .as_array()
        .ok_or_else(|| invalid("command destination files"))?
    {
        let path =
            Path::new(row["path"].as_str().ok_or_else(|| invalid("command destination path"))?);
        validate_path(path, root)?;
    }
    Ok(())
}

fn destinations(applied: &Value, directory: &Path) -> io::Result<Vec<Value>> {
    let rows = applied["files"].as_array().ok_or_else(|| invalid("command applied files"))?;
    rows.iter().map(|row| {
        let name = row["relativePath"].as_str().ok_or_else(|| invalid("command output file"))?;
        crate::checkout::plan::relative_path(name)?;
        if name == ".bitmap" { return Err(invalid("command tracked nested bitmap")); }
        Ok(json!({"planIndex":row["planIndex"],"path":directory.join(name),"overwrite":true,"eol":"auto"}))
    }).collect()
}

fn statuses(applied: &Value) -> io::Result<serde_json::Map<String, Value>> {
    let statuses =
        applied["filesStatus"].as_array().ok_or_else(|| invalid("command file statuses"))?;
    statuses
        .iter()
        .map(|row| {
            Ok((
                row["relativePath"]
                    .as_str()
                    .ok_or_else(|| invalid("command status path"))?
                    .to_owned(),
                row["status"].clone(),
            ))
        })
        .collect()
}

fn validate_path(path: &Path, root: &Path) -> io::Result<()> {
    let relative = path.strip_prefix(root).map_err(io::Error::other)?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata)
                if current == path && metadata.is_file()
                    || current != path && metadata.is_dir() => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
            _ => return Err(invalid("command nonordinary destination")),
        }
    }
    Ok(())
}

fn transition_request(input: &Input<'_>) -> io::Result<Value> {
    let workspace_root = input.current.target.directory == ".";
    let nested = if workspace_root { root::nested_directories(input.root)? } else { Vec::new() };
    let mut target = manifest(input.reference, input.version)?;
    if workspace_root {
        root::validate_version(input.version)?;
        root::filter(&mut target, &nested)?;
    }
    let mut base = input.base.map(|(hash, value)| manifest(hash, value)).transpose()?;
    if workspace_root && let Some(base) = base.as_mut() {
        root::filter(base, &nested)?;
    }
    Ok(json!({
        "objectsDirectory":crate::scope_path(input.root).join("objects"),"snapshotDirectory":input.directory,
        "target":target,"current":input.current.files,"base":base,
        "labels":input.base.map(|_|json!({"current":format!("{} modified",input.current.target.version),"other":if super::checkout_stash::loading(input.options){json!("stash")}else{input.selection["version"].clone()}})),
    }))
}

#[cfg(test)]
mod tests;
