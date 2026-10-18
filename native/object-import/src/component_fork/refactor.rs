//! Retained whole-component writes for fork dependency and bulk string replacements.
use super::{files, required, unsupported};
use crate::{component_rename::copy_refactor, component_tracking::observe::Observed};
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};

pub struct Refactor {
    groups: Vec<Group>,
    observed: Observed,
}
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
        let mut plan = Self { groups: Vec::new(), observed: Observed::default() };
        for row in rows {
            let group = group(root, row, pairs, package, ast, &mut plan.observed)?;
            plan.groups.push(group);
        }
        plan.budget()?;
        plan.validate()?;
        Ok(plan)
    }
    pub fn validate(&self) -> io::Result<()> {
        self.observed.validate()
    }
    #[must_use]
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
        .ok_or_else(|| unsupported("fork refactor component root"))?;
    let mut group = Group { files: Vec::new(), initial: Vec::new() };
    for file in row["files"].as_array().ok_or_else(|| unsupported("fork refactor files"))? {
        let relative = file
            .as_str()
            .or_else(|| file["relativePath"].as_str())
            .ok_or_else(|| unsupported("fork refactor file path"))?;
        files::relative_path(relative)?;
        let destination = root.join(directory).join(relative);
        observed.ancestors(
            root,
            destination.parent().ok_or_else(|| unsupported("fork refactor parent"))?,
        )?;
        observed.read(&destination)?;
        let mut source = row.clone();
        source["rootDir"] = serde_json::json!(directory);
        let path = files::source_path(root, &source, relative, observed)?;
        let before = required(observed, &path)?;
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
