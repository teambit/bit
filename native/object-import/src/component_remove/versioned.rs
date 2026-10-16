//! Forced local removal of a single staged, tagged Component.

use super::{Plan, invalid, validate_ancestors};
use crate::workspace::engine::command::outbound;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub struct VersionedPlan {
    workspace: Plan,
    index: Change,
    staged: Change,
    objects: Vec<Change>,
}

struct Change {
    path: PathBuf,
    before: Vec<u8>,
    after: Option<Vec<u8>>,
}

impl VersionedPlan {
    pub fn prepare(root: &Path, name: &str, keep_files: bool) -> io::Result<Self> {
        let workspace = Plan::prepare_with(root, name, keep_files, true)?;
        if !workspace.main_exists {
            return Err(invalid("tagged component main file is missing"));
        }
        let (scope, component_name) = workspace.identity
            .split_once('/')
            .ok_or_else(|| invalid("tagged component identity"))?;
        let version = workspace.version.as_deref().ok_or_else(|| invalid("tagged version"))?;
        if manifest_references_package(root, &workspace.package)? {
            return Err(invalid("component is listed in package dependencies"));
        }
        let (index, model_hash) = index_change(root, scope, component_name)?;
        let (staged, staged_version) = staged_change(root, scope, component_name)?;
        let objects =
            object_changes(root, scope, component_name, version, &staged_version, &model_hash)?;
        Ok(Self { workspace, index, staged, objects })
    }

    #[must_use]
    pub fn identity(&self) -> &str {
        self.workspace.identity()
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.workspace.validate_before_commit(file_id)?;
        for change in std::iter::once(&self.index)
            .chain(std::iter::once(&self.staged))
            .chain(self.objects.iter())
        {
            regular_file(&self.workspace.root, &change.path)?;
            if fs::read(&change.path)? != change.before {
                return Err(invalid("tagged component model changed before removal"));
            }
        }
        for object in &self.objects {
            fs::remove_file(&object.path)?;
            let parent = object.path.parent().ok_or_else(|| invalid("object directory"))?;
            match fs::remove_dir(parent) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::DirectoryNotEmpty => {}
                Err(error) => return Err(error),
            }
        }
        fs::write(
            &self.index.path,
            self.index.after.as_ref().ok_or_else(|| invalid("scope index"))?,
        )?;
        fs::write(
            &self.staged.path,
            self.staged.after.as_ref().ok_or_else(|| invalid("staged config"))?,
        )?;
        self.workspace.apply(file_id)
    }
}

fn manifest_references_package(root: &Path, package_path: &Path) -> io::Result<bool> {
    let package_name = package_path.file_name().ok_or_else(|| invalid("package name"))?;
    let scope = package_path
        .parent()
        .and_then(Path::file_name)
        .ok_or_else(|| invalid("package scope"))?;
    let dependency = format!("{}/{}", scope.to_string_lossy(), package_name.to_string_lossy());
    let manifest = root.join("package.json");
    Ok(manifest.try_exists()? && fs::read_to_string(manifest)?.contains(&dependency))
}

fn index_change(root: &Path, scope: &str, name: &str) -> io::Result<(Change, String)> {
    let path = root.join(".bit/index.json");
    regular_file(root, &path)?;
    let before = fs::read(&path)?;
    let mut index: Value = serde_json::from_slice(&before)?;
    if index["lanes"]
        .as_array()
        .is_none_or(|lanes| !lanes.is_empty())
    {
        return Err(invalid("tagged component has indexed lanes"));
    }
    let rows = index["components"].as_array_mut().ok_or_else(|| invalid("scope components"))?;
    let position = unique_position(rows, scope, name)?;
    if rows[position]["isSymlink"] != false {
        return Err(invalid("tagged scope model is a symlink"));
    }
    let hash = rows[position]["hash"]
        .as_str()
        .ok_or_else(|| invalid("Component hash"))?
        .to_owned();
    crate::merge_history::hash(&hash)?;
    rows.remove(position);
    let mut after = serde_json::to_vec_pretty(&index)?;
    after.push(b'\n');
    Ok((Change { path, before, after: Some(after) }, hash))
}

fn unique_position(rows: &[Value], scope: &str, name: &str) -> io::Result<usize> {
    let mut matching = rows
        .iter()
        .enumerate()
        .filter_map(|(position, row)| {
            (row["id"]["scope"] == scope && row["id"]["name"] == name).then_some(position)
        });
    let position = matching.next().ok_or_else(|| invalid("tagged scope model absent"))?;
    if matching.next().is_some() {
        return Err(invalid("tagged scope model is ambiguous"));
    }
    Ok(position)
}

fn object_changes(
    root: &Path,
    scope: &str,
    name: &str,
    version: &str,
    staged_version: &str,
    model_hash: &str,
) -> io::Result<Vec<Change>> {
    let dir = root.join(".bit/objects");
    let model = outbound::read_object(&dir, model_hash, "Component")?;
    let versions = model["versions"].as_object().ok_or_else(|| invalid("Component versions"))?;
    if model["scope"] != scope
        || model["name"] != name
        || versions.is_empty()
        || versions.len() > 32
        || model.get("orphanedVersions").is_some()
        || !versions.contains_key(staged_version)
    {
        return Err(invalid("unsupported tagged Component model"));
    }
    let head_hash = versions
        .get(version)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("tagged version ref"))?;
    if model["head"] != head_hash {
        return Err(invalid("tagged Component head"));
    }
    let mut hashes = vec![model_hash.to_owned()];
    for (label, value) in versions {
        let hash = value.as_str().ok_or_else(|| invalid("tagged version ref"))?;
        crate::merge_history::hash(hash)?;
        if model["state"]["versions"][label]["local"] != true
            || hashes
                .iter()
                .any(|current| current == hash)
        {
            return Err(invalid("tagged version is not local and unique"));
        }
        let _version = outbound::read_object(&dir, hash, "Version")?;
        hashes.push(hash.to_owned());
    }
    let mut changes = Vec::new();
    for hash in hashes {
        let path = dir.join(&hash[..2]).join(&hash[2..]);
        regular_file(root, &path)?;
        changes.push(Change { before: fs::read(&path)?, path, after: None });
    }
    Ok(changes)
}

fn staged_change(root: &Path, scope: &str, name: &str) -> io::Result<(Change, String)> {
    let path = root.join(".bit/staged-config/main.json");
    regular_file(root, &path)?;
    let before = fs::read(&path)?;
    let mut staged: Value = serde_json::from_slice(&before)?;
    let rows = staged.as_array_mut().ok_or_else(|| invalid("staged component config"))?;
    let position = unique_position(rows, scope, name)?;
    let staged_version = rows[position]["id"]["version"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("staged version"))?
        .to_owned();
    rows.remove(position);
    let after = serde_json::to_vec_pretty(&staged)?;
    Ok((Change { path, before, after: Some(after) }, staged_version))
}

fn regular_file(root: &Path, path: &Path) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| invalid("model path"))?;
    validate_ancestors(root, parent.strip_prefix(root).map_err(|_| invalid("model path"))?)?;
    let kind = fs::symlink_metadata(path)?.file_type();
    if !kind.is_file() || kind.is_symlink() {
        return Err(invalid("model path is not a regular file"));
    }
    Ok(())
}
