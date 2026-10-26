//! Where imported components are written: the workspace's `defaultDirectory`,
//! with the fixes `ComponentWriter` applies when directories collide.
use super::super::{Target, invalid};
use serde_json::{Map, Value};
use std::{io, path::Path};

/// Each target's directory: the template, then `fixDirsIfEqual` and
/// `fixDirsIfNested` against the bitmap's existing `rootDir`s.
pub(super) fn assign(
    root: &Path,
    template: &str,
    targets: &[Target],
    rows: &Map<String, Value>,
    avoid: bool,
    retained: &mut super::relocation::Retained,
) -> io::Result<Vec<String>> {
    let existing: Vec<String> = rows
        .values()
        .filter_map(|row| row["rootDir"].as_str().map(str::to_owned))
        .collect();
    let mut directories = targets
        .iter()
        .map(|target| {
            let scope =
                target.scope.as_deref().ok_or_else(|| invalid("inbound workspace scope"))?;
            let directory = directory(template, scope, &target.name)?;
            if avoid {
                retained.avoid_tracked(root, directory, target, rows)
            } else {
                Ok(directory)
            }
        })
        .collect::<io::Result<Vec<_>>>()?;
    fix_dirs_if_equal(targets, &mut directories);
    fix_dirs_if_nested(&mut directories, &existing);
    Ok(directories)
}

/// `incrementPathRecursively`: `<path>_1`, or the first free `<path>_<n>`.
fn increment_path(path: &str, all: &[String]) -> String {
    let mut number = 1;
    loop {
        let candidate = format!("{path}_{number}");
        if !all.contains(&candidate) {
            return candidate;
        }
        number += 1;
    }
}

/// `fixDirsIfEqual`: components of different owners whose directories match
/// move under their owner's name, or get a numbered suffix.
pub(super) fn fix_dirs_if_equal(targets: &[Target], directories: &mut [String]) {
    let mut all: Vec<String> = directories.to_vec();
    for duplicate in duplicates(directories) {
        relocate(targets, directories, &duplicate, &mut all);
    }
}

/// Move every target in `duplicate` to its owner's directory or a suffix.
fn relocate(
    targets: &[Target],
    directories: &mut [String],
    duplicate: &str,
    all: &mut Vec<String>,
) {
    for (target, directory) in targets.iter().zip(directories.iter_mut()) {
        if directory != duplicate {
            continue;
        }
        let moved = owner_directory(target, duplicate, all);
        *directory = moved.unwrap_or_else(|| increment_path(duplicate, all));
        all.push(directory.clone());
    }
}

/// The directories that more than one target has, each once.
fn duplicates(directories: &[String]) -> Vec<String> {
    let mut duplicates: Vec<String> = Vec::new();
    for directory in directories {
        let count = directories
            .iter()
            .filter(|other| *other == directory)
            .count();
        if count > 1 && !duplicates.contains(directory) {
            duplicates.push(directory.clone());
        }
    }
    duplicates
}

/// `<owner>/<directory>` for a scope with an owner, unless it is taken.
fn owner_directory(target: &Target, directory: &str, all: &[String]) -> Option<String> {
    let owner = target.scope
        .as_deref()
        .filter(|scope| scope.contains('.'))?
        .split('.')
        .next()?;
    let owned = format!("{owner}/{directory}");
    (!directory.starts_with(owner) && !all.contains(&owned)).then_some(owned)
}

/// `fixDirsIfNested`: a directory that would contain another component's
/// directory gets a numbered suffix, and so does a new directory nested in an
/// existing component's.
pub(super) fn fix_dirs_if_nested(directories: &mut [String], existing: &[String]) {
    let all = directories.to_vec();
    let parents: Vec<usize> = (0..directories.len())
        .filter(|&index| {
            let prefix = format!("{}/", directories[index]);
            all.iter()
                .any(|other| other.starts_with(&prefix))
        })
        .collect();
    let mut paths: Vec<String> = existing.to_vec();
    paths.extend(
        parents
            .iter()
            .map(|&index| directories[index].clone()),
    );
    for &index in &parents {
        if !existing.contains(&directories[index]) {
            directories[index] = increment_path(&directories[index], &paths);
        }
    }
    for directory in directories.iter_mut() {
        let prefix = format!("{directory}/");
        if existing
            .iter()
            .any(|other| other.starts_with(&prefix))
            && !existing.contains(directory)
        {
            *directory = increment_path(directory, &paths);
        }
    }
    for directory in directories.iter_mut() {
        let Some(parent) = existing
            .iter()
            .find(|other| directory.starts_with(&format!("{other}/")))
        else {
            continue;
        };
        let renamed = increment_path(parent, &paths);
        *directory = directory.replacen(parent.as_str(), &renamed, 1);
    }
}

fn directory(template: &str, scope: &str, name: &str) -> io::Result<String> {
    let (owner, short) = scope
        .rsplit_once('.')
        .unwrap_or(("", scope));
    let path = template
        .replace("{scopeId}", scope)
        .replace("{scope}", short)
        .replace("{owner}", owner)
        .replace("{name}", name);
    if path.contains('{') || path.contains('}') || path == "." {
        return Err(invalid("inbound unsupported workspace directory template"));
    }
    crate::checkout::plan::relative_path(&path)?;
    Ok(path)
}

pub(super) fn default_directory(root: &Path) -> io::Result<String> {
    let workspace = super::super::config::configuration(root)?;
    let template = match workspace.get("defaultDirectory") {
        None => "components/{name}",
        Some(value) => {
            value.as_str().ok_or_else(|| invalid("inbound workspace default directory"))?
        }
    };
    Ok(if template.contains("{name}") {
        template.to_owned()
    } else {
        format!("{template}/{{name}}")
    })
}

#[cfg(test)]
mod tests;
