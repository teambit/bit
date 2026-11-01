//! Retained whole-component writes for fork dependency and bulk string replacements.
use super::{files, required, unsupported};
use crate::{component_rename::copy_refactor, component_tracking::observe::Observed};
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refactor {
    groups: Vec<Group>,
    observed: Observed,
}
#[derive(Debug, Clone, PartialEq, Eq)]
struct Group {
    files: Vec<files::Copy>,
    initial: Vec<Vec<u8>>,
}
impl Refactor {
    pub fn prepare(
        root: &Path,
        rows: &[Value],
        pairs: &[(String, String)],
        package: bool,
        ast: bool,
    ) -> io::Result<Self> {
        if rows.len() > 4096 || pairs.len() > 4096 {
            return Err(unsupported("fork refactor batch limit"));
        }
        let mut plan =
            Self { groups: Vec::with_capacity(rows.len()), observed: Observed::default() };
        for row in rows {
            let group = group(root, row, pairs, package, ast, &mut plan.observed)?;
            plan.groups.push(group);
        }
        plan.budget()?;
        plan.validate()?;
        Ok(plan)
    }
    #[inline]
    pub fn validate(&self) -> io::Result<()> {
        self.observed.validate()
    }
    #[must_use]
    #[inline]
    pub fn ast_inputs(&self) -> Vec<(PathBuf, Vec<u8>)> {
        self.groups
            .iter()
            .flat_map(|group| group.files.iter())
            .filter(|file| !crate::checkout::eol::binary(&file.bytes))
            .map(|file| (file.destination.clone(), file.bytes.clone()))
            .collect()
    }
    pub fn transformed(&mut self, path: &Path, bytes: Vec<u8>) -> io::Result<()> {
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(unsupported("fork refactor transformed bytes"));
        }
        let file = self.groups
            .iter_mut()
            .flat_map(|group| group.files.iter_mut())
            .find(|file| file.destination == path)
            .ok_or_else(|| unsupported("fork refactor transformed path"))?;
        file.bytes = bytes;
        self.budget()?;
        Ok(())
    }
    fn budget(&self) -> io::Result<()> {
        let bytes = self.groups
            .iter()
            .flat_map(|group| group.files.iter())
            .try_fold(0usize, |total, file| total.checked_add(file.bytes.len()))
            .ok_or_else(|| unsupported("fork refactor byte overflow"))?;
        if bytes > 128 * 1024 * 1024 {
            return Err(unsupported("fork refactor aggregate byte limit"));
        }
        Ok(())
    }
    pub fn apply(&self) -> io::Result<()> {
        self.validate()?;
        for group in &self.groups {
            if group.files
                .iter()
                .zip(&group.initial)
                .any(|(file, before)| &file.bytes != before)
            {
                files::apply(&group.files)?;
            }
        }
        Ok(())
    }
}
fn refactor_relative_path(file: &Value) -> io::Result<&str> {
    let relative = [file, &file["relativePath"], &file["path"]]
        .into_iter()
        .find_map(|val| {
            val.as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty())
        })
        .ok_or_else(|| unsupported("fork refactor file path"))?;
    files::relative_path(relative)?;
    Ok(relative)
}
fn group(
    root: &Path,
    row: &Value,
    pairs: &[(String, String)],
    package: bool,
    ast: bool,
    observed: &mut Observed,
) -> io::Result<Group> {
    let directory = row["directory"]
        .as_str()
        .or_else(|| row["rootDir"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| unsupported("fork refactor component root"))?;
    files::relative_path(directory)?;
    let files = row["files"]
        .as_array()
        .filter(|files| files.len() <= 16384)
        .ok_or_else(|| unsupported("fork refactor files"))?;
    let mut group =
        Group { files: Vec::with_capacity(files.len()), initial: Vec::with_capacity(files.len()) };
    let target_dir = root.join(directory);
    let mut source = row.clone();
    source["rootDir"] = serde_json::json!(directory);
    for file in files {
        let relative = refactor_relative_path(file)?;
        let destination = target_dir.join(relative);
        observed.ancestors(
            root,
            destination.parent().ok_or_else(|| unsupported("fork refactor parent"))?,
        )?;
        observed.read(&destination)?;
        let path = files::source_path(root, &source, relative, observed)?;
        let before = required(observed, &path)?;
        if before.len() > 32 * 1024 * 1024 {
            return Err(unsupported("fork refactor single file byte limit"));
        }
        let bytes = if ast { before.clone() } else { replace(&before, pairs, package)? };
        group.initial.push(before);
        group.files.push(files::Copy { source: path, destination, bytes });
    }
    files::budget(&group.files)?;
    Ok(group)
}
fn replace(bytes: &[u8], pairs: &[(String, String)], package: bool) -> io::Result<Vec<u8>> {
    let mut output = bytes.to_vec();
    for (from, to) in pairs {
        output = if package {
            copy_refactor::package(&output, from, to)?
        } else {
            copy_refactor::replace(&output, from, to)?
        };
    }
    Ok(output)
}
