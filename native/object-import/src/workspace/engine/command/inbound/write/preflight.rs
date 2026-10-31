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
    let directories = target_directories(
        root,
        &template,
        targets,
        rows,
        options,
        &mut super::relocation::Retained::default(),
    )?;
    let mut directories = directories.iter();
    for target in targets {
        let matched = rows.iter().find(|(key, row)| super::matches_target(key, row, target));
        if let Some((key, row)) = matched {
            existing_target(root, target, key, row, options)?;
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
    key: &str,
    row: &Value,
    options: Options<'_>,
) -> io::Result<()> {
    if options.track_only {
        return Ok(());
    }
    let (scope, _) = crate::reset_lane::bitmap::row_identity(key, row);
    let Some(scope) = scope
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
    else {
        return Ok(());
    };
    let hash = crate::validate::hexadecimal(&Sha1::digest(
        format!("{scope}/{}", target.name.trim()).as_bytes(),
    ));
    let Some(model) = super::super::details::local_object(root, &hash, "Component")? else {
        return Ok(());
    };
    if options.merge_strategy.is_some() && has_local_versions(&model) {
        return Err(invalid("inbound existing component has local versions"));
    }
    let requested = requested_version(key, row)?;
    let (_, hash) = super::version(&model, requested)?;
    let Some(version) = super::super::details::local_object(root, &hash, "Version")? else {
        return Ok(());
    };
    if options.override_existing || options.merge_strategy.is_some() {
        return Ok(());
    }
    check_sources(root, row, &version)
}

fn has_local_versions(model: &Value) -> bool {
    model["state"]["versions"]
        .as_object()
        .is_some_and(|versions| {
            versions
                .values()
                .any(|entry| entry["local"] == true)
        })
}

fn requested_version<'a>(key: &'a str, row: &'a Value) -> io::Result<&'a str> {
    row["version"]
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .or_else(|| {
            key.rsplit_once('@')
                .map(|(_, ver)| ver.trim())
                .filter(|ver| !ver.is_empty())
        })
        .ok_or_else(|| invalid("inbound existing version"))
}

fn check_sources(root: &Path, row: &Value, version: &Value) -> io::Result<()> {
    let directory = row["rootDir"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("inbound existing root directory"))?;
    crate::checkout::plan::relative_path(directory)?;
    let files = version["files"]
        .as_array()
        .filter(|files| files.len() <= 4096)
        .ok_or_else(|| invalid("inbound existing files"))?;
    let mut compressed = 0;
    let mut bytes = 0_usize;
    for file in files {
        let relative = file["relativePath"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("inbound existing file path"))?;
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
