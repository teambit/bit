//! Local-only eligibility before providers; authoritative preparation repeats these reads.
use super::{Options, Target, directories, existing, invalid, new_directory, target_directories};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{io, path::Path};

pub(in super::super) fn check(
    root: &Path,
    targets: &[Target],
    options: Options<'_>,
) -> io::Result<()> {
    let bitmap = super::super::config::document(&root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("inbound bitmap object"))?;
    let template = directories::default_directory(root)?;
    let shape = ["{scopeId}", "{scope}", "{owner}", "{name}"]
        .iter()
        .fold(template.clone(), |path, token| path.replace(token, "component"));
    if shape.contains('{') || shape.contains('}') {
        return Err(invalid("inbound unsupported workspace directory template"));
    }
    crate::checkout::plan::relative_path(&shape)?;
    let directories = target_directories(&template, targets, rows, options.path)?;
    let mut directories = directories.iter();
    for target in targets {
        let row = rows
            .values()
            .find(|row| row["name"] == target.name);
        if let Some(row) = row {
            existing_target(root, target, row, options)?;
        } else if !options.track_only && !options.write_to_empty_dir {
            let directory =
                directories.next().ok_or_else(|| invalid("inbound preflight directory"))?;
            new_directory(root, directory, options.override_existing)?;
        }
    }
    Ok(())
}

fn existing_target(
    root: &Path,
    target: &Target,
    row: &Value,
    options: Options<'_>,
) -> io::Result<()> {
    if options.track_only {
        return Ok(());
    }
    let scope = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty());
    let Some(scope) = scope else { return Ok(()) };
    let hash =
        crate::validate::hexadecimal(&Sha1::digest(format!("{scope}/{}", target.name).as_bytes()));
    let Some(model) = super::super::details::local_object(root, &hash, "Component")? else {
        return Ok(());
    };
    let requested = row["version"].as_str().ok_or_else(|| invalid("inbound existing version"))?;
    let (_, hash) = super::version(&model, requested)?;
    let Some(version) = super::super::details::local_object(root, &hash, "Version")? else {
        return Ok(());
    };
    if options.override_existing || options.merge_strategy.is_some() {
        return Ok(());
    }
    check_sources(root, row, &version)
}

fn check_sources(root: &Path, row: &Value, version: &Value) -> io::Result<()> {
    let directory =
        row["rootDir"].as_str().ok_or_else(|| invalid("inbound existing root directory"))?;
    crate::checkout::plan::relative_path(directory)?;
    let files = version["files"]
        .as_array()
        .filter(|files| files.len() <= 4096)
        .ok_or_else(|| invalid("inbound existing files"))?;
    let mut compressed = 0;
    let mut bytes = 0_usize;
    for file in files {
        let relative =
            file["relativePath"].as_str().ok_or_else(|| invalid("inbound existing file path"))?;
        crate::checkout::plan::relative_path(relative)?;
        let hash = file["file"].as_str().ok_or_else(|| invalid("inbound existing Source"))?;
        let body = crate::checkout::repository::source(
            &crate::scope_path(root).join("objects"),
            crate::merge_history::hash(hash)?,
            32 * 1024 * 1024,
            &mut compressed,
        )?;
        bytes = bytes
            .checked_add(body.len())
            .filter(|bytes| *bytes <= super::MAX_WRITTEN_BYTES)
            .ok_or_else(|| invalid("inbound preflight source budget"))?;
        let path = root.join(directory).join(relative);
        match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
            Ok(_) => existing::check(root, &path, &crate::checkout::eol::auto(body))?,
        }
    }
    Ok(())
}
