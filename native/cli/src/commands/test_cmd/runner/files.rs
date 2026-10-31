//! Resolve explicit test files without running component loaders or user tests.
use super::{invalid, paths};
use crate::commands::workspace_command::component_service::Component;
use bit_install::{dependencies::glob, workspace::Bitmap};
use std::{
    env, io,
    path::{Path, PathBuf},
};

pub(super) struct Selected {
    pub identities: Vec<String>,
    pub paths: Vec<PathBuf>,
}

pub(super) fn select(root: &Path, values: &[String]) -> io::Result<Option<Selected>> {
    if !any_existing_file(values) {
        return Ok(None);
    }
    if !all_existing_files(values) {
        return Err(invalid("tester mixed file selection"));
    }
    let cwd = env::current_dir()?;
    let paths: Vec<_> = values
        .iter()
        .map(|value| paths::normalized(&cwd.join(value)))
        .collect();
    let bitmap = Bitmap::load(root, None)?;
    let mut identities = Vec::new();
    for path in &paths {
        let identity = owner(root, &bitmap, path)?;
        if !identities.contains(&identity) {
            identities.push(identity);
        }
    }
    Ok(Some(Selected { identities, paths }))
}
fn owner(root: &Path, bitmap: &Bitmap, path: &Path) -> io::Result<String> {
    let mut owners = bitmap.entries
        .iter()
        .filter(|entry| {
            entry.owns_its_dir() && path.starts_with(paths::normalized(&root.join(&entry.root_dir)))
        });
    let identity = owners
        .next()
        .ok_or_else(|| invalid("tester file owner"))?
        .id
        .to_string_without_version();
    if owners.next().is_some() {
        return Err(invalid("tester overlapping component file owners"));
    }
    Ok(identity)
}

pub(super) fn tests(component: &Component, patterns: &[String]) -> io::Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for file in &component.files {
        let relative = file["filePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("tester relative file"))?;
        if glob::match_patterns(relative, patterns) {
            let absolute = file["absolutePath"]
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or_else(|| invalid("tester absolute file"))?;
            paths.push(paths::normalized(Path::new(absolute)));
        }
    }
    Ok(paths)
}

fn any_existing_file(values: &[String]) -> bool {
    values
        .iter()
        .any(|value| Path::new(value.trim()).is_file())
}

fn all_existing_files(values: &[String]) -> bool {
    values
        .iter()
        .all(|value| Path::new(value.trim()).is_file())
}
