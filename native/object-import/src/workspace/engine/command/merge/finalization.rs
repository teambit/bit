#[cfg(test)]
mod tests;

mod metadata;
mod packages;
mod staged;
use super::invalid;
use crate::workspace::engine::dependency_graph::proof;
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

pub(in crate::workspace::engine::command) struct Input<'a> {
    pub identity: &'a str,
    pub directory: &'a str,
    pub hash: &'a str,
    pub semantic_version: Option<&'a str>,
    pub version: &'a Value,
}
pub(in crate::workspace::engine::command) struct Prepared {
    proofs: Vec<proof::Proof>,
    writes: Vec<(PathBuf, Vec<u8>)>,
    links: Vec<(PathBuf, PathBuf)>,
    copies: Vec<(PathBuf, PathBuf)>,
    package_creates: Vec<PathBuf>,
}
pub(in crate::workspace::engine::command) fn prepare(
    root: &Path,
    inputs: &[Input<'_>],
    root_components: bool,
    skip_packages: &[String],
) -> io::Result<Prepared> {
    prepare_with(root, inputs, root_components, skip_packages, &HashSet::new())
}

pub(in crate::workspace::engine::command) fn prepare_tag(
    root: &Path,
    inputs: &[Input<'_>],
    root_components: bool,
    skip_packages: &[String],
    new_components: &HashSet<String>,
) -> io::Result<Prepared> {
    prepare_with(root, inputs, root_components, skip_packages, new_components)
}

fn prepare_with(
    root: &Path,
    inputs: &[Input<'_>],
    root_components: bool,
    skip_packages: &[String],
    new_components: &HashSet<String>,
) -> io::Result<Prepared> {
    if inputs.len() > 4096 {
        return Err(invalid("merge finalization component budget"));
    }
    let mut prepared = Prepared {
        proofs: Vec::new(),
        writes: Vec::new(),
        links: Vec::new(),
        copies: Vec::new(),
        package_creates: Vec::new(),
    };
    staged::prepare(root, inputs, &mut prepared)?;
    for input in inputs
        .iter()
        .filter(|input| {
            !input.directory.is_empty()
                && !skip_packages
                    .iter()
                    .any(|id| id == input.identity)
        })
    {
        packages::prepare(
            root,
            input,
            root_components,
            new_components.contains(input.identity),
            &mut prepared,
        )?;
    }
    #[cfg(not(unix))]
    if !prepared.links.is_empty() {
        return Err(invalid("merge native linking platform"));
    }
    prepared.validate()?;
    Ok(prepared)
}
impl Prepared {
    pub(in crate::workspace::engine::command) fn mark_lane_new(
        &mut self,
        root: &Path,
        identities: &[String],
    ) -> io::Result<()> {
        staged::mark_lane_new(root, identities, self)
    }

    /// Ordinary resolve regenerates each visible package from its current `ConsumerComponent`.
    /// Its license label follows the new Version's license, not the old package manifest.
    pub(in crate::workspace::engine::command) fn resolve_licenses(
        &mut self,
        root: &Path,
        inputs: &[Input<'_>],
        skip_packages: &[String],
    ) -> io::Result<()> {
        for input in inputs
            .iter()
            .filter(|input| {
                !input.directory.is_empty()
                    && !skip_packages
                        .iter()
                        .any(|id| id == input.identity)
            })
        {
            let package = packages::package_name(input.version)?;
            let path = root
                .join("node_modules")
                .join(package)
                .join("package.json");
            let row = self.writes
                .iter_mut()
                .find(|(destination, _)| *destination == path)
                .ok_or_else(|| invalid("resolve generated package write"))?;
            let mut manifest = json(&row.1)?;
            manifest["license"] = Value::String(
                if has_license(&input.version["license"]) {
                    "SEE LICENSE IN LICENSE"
                } else {
                    "SEE LICENSE IN UNLICENSED"
                }
                .into(),
            );
            row.1 = pretty(&manifest, true)?;
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn snapshot_index<'a>(
        &mut self,
        root: &Path,
        identities: impl Iterator<Item = &'a str>,
    ) -> io::Result<()> {
        let path = root.join(".bit/index.json");
        let row = self.writes
            .iter_mut()
            .find(|(name, _)| *name == path)
            .ok_or_else(|| invalid("snapshot index plan absent"))?;
        let mut index = json(&row.1)?;
        let rows = if index.is_array() { &mut index } else { &mut index["components"] };
        let rows = rows.as_array_mut().ok_or_else(|| invalid("snapshot index components"))?;
        for identity in identities {
            let (scope, name) =
                identity.split_once('/').ok_or_else(|| invalid("snapshot index identity"))?;
            let hash = crate::workspace::engine::hash(identity.as_bytes());
            if rows
                .iter()
                .any(|row| row["hash"] == hash)
            {
                return Err(invalid("snapshot new index component exists"));
            }
            rows.push(
                serde_json::json!({"id":{"scope":scope,"name":name},"isSymlink":false,"hash":hash}),
            );
        }
        row.1 = pretty(&index, true)?;
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn imported_index(
        &mut self,
        root: &Path,
        index: Option<&Value>,
    ) -> io::Result<()> {
        if let Some(index) = index {
            let destination = root.join(".bit/index.json");
            let row = self.writes
                .iter_mut()
                .find(|(path, _)| *path == destination)
                .ok_or_else(|| invalid("merge staged index missing"))?;
            row.1 = pretty(index, true)?;
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn validate(&self) -> io::Result<()> {
        proof::verify(&self.proofs)
    }
    pub(in crate::workspace::engine::command) fn commit(&self) -> io::Result<()> {
        // Validation belongs before the command's first write; source materialization has
        // already happened when these links and generated package metadata are published.
        for (source, destination) in &self.links {
            fs::create_dir_all(destination.parent().ok_or_else(|| invalid("merge link parent"))?)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(source, destination)?;
            #[cfg(not(unix))]
            return Err(invalid("merge native linking platform"));
        }
        for (source, destination) in &self.copies {
            fs::create_dir_all(destination.parent().ok_or_else(|| invalid("merge copy parent"))?)?;
            if fs::hard_link(source, destination).is_err() {
                fs::copy(source, destination)?;
            }
        }
        for (path, bytes) in &self.writes {
            self.write(path, bytes)?;
        }
        Ok(())
    }
    fn write(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        fs::create_dir_all(path.parent().ok_or_else(|| invalid("merge metadata parent"))?)?;
        if path
            .file_name()
            .is_some_and(|name| name == "package.json")
        {
            if self.package_creates.contains(&path.to_path_buf()) {
                let mut file = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(path)?;
                file.write_all(bytes)?;
                file.sync_all()?;
            } else {
                metadata::replace(path, bytes)?;
            }
        } else {
            fs::write(path, bytes)?;
        }
        Ok(())
    }
}
fn has_license(value: &Value) -> bool {
    match value {
        Value::String(text) => !text.is_empty(),
        Value::Array(rows) => !rows.is_empty(),
        Value::Object(fields) => !fields.is_empty(),
        _ => false,
    }
}
fn json(bytes: &[u8]) -> io::Result<Value> {
    serde_json::from_slice(bytes).map_err(io::Error::other)
}
fn pretty(value: &Value, newline: bool) -> io::Result<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(io::Error::other)?;
    if newline {
        bytes.push(b'\n');
    }
    Ok(bytes)
}
