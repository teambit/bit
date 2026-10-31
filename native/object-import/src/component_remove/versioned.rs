//! Local removal of a staged tagged or imported Component.

pub(super) use publication::publish;

mod history;
mod publication;
use history::plan as lane_history;

use super::{Plan, RowKind, invalid, validate_ancestors};
use crate::workspace::engine::command::outbound;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub struct VersionedPlan {
    workspace: Plan,
    index: Change,
    staged: Option<Change>,
    objects: Vec<Change>,
    lane: Option<Change>,
    history: Option<HistoryState>,
}

struct HistoryState {
    path: PathBuf,
    before: Option<Vec<u8>>,
    after: Option<Vec<u8>>,
}

struct Change {
    path: PathBuf,
    before: Vec<u8>,
    after: Option<Vec<u8>>,
}

struct ModelSelection<'a> {
    scope: &'a str,
    name: &'a str,
    model_hash: &'a str,
}

impl VersionedPlan {
    pub fn prepare(root: &Path, name: &str, keep_files: bool) -> io::Result<Self> {
        Self::prepare_kind(root, name, keep_files, RowKind::Staged, false)
    }

    pub fn prepare_imported(root: &Path, name: &str, keep_files: bool) -> io::Result<Self> {
        Self::prepare_kind(root, name, keep_files, RowKind::Imported, false)
    }

    pub fn prepare_lane_snap(
        root: &Path,
        name: &str,
        keep_files: bool,
        status_checked: bool,
    ) -> io::Result<Self> {
        Self::prepare_kind(root, name, keep_files, RowKind::LaneSnap, status_checked)
    }

    fn prepare_kind(
        root: &Path,
        name: &str,
        keep_files: bool,
        kind: RowKind,
        status_checked: bool,
    ) -> io::Result<Self> {
        let workspace = Plan::prepare_with(root, name, keep_files, kind)?;
        let (scope, component_name) = workspace.identity
            .split_once('/')
            .ok_or_else(|| invalid("tagged component identity"))?;
        let version = workspace.version.as_deref().ok_or_else(|| invalid("tagged version"))?;
        let (index, model_hash) = index_change(root, scope, component_name, kind)?;
        let (staged, _staged_version) =
            staged_selection(root, scope, component_name, kind, workspace.lane.as_ref())?;
        let objects = object_changes(
            root,
            &ModelSelection { scope, name: component_name, model_hash: &model_hash },
        )?;
        let lane = workspace.lane
            .as_ref()
            .map(|lane| lane_change(lane, scope, component_name))
            .transpose()?;
        let history = (kind == RowKind::LaneSnap && status_checked)
            .then(|| lane_history(root, scope, component_name, version))
            .transpose()?;
        Ok(Self { workspace, index, staged, objects, lane, history })
    }

    pub(super) fn package_path(&mut self, path: PathBuf) {
        self.workspace.package = path;
    }
    pub(super) fn is_staged(&self) -> bool {
        (self.staged.is_some() || self.workspace.lane.is_some())
            && self.workspace.main_exists
    }

    #[must_use]
    pub fn identity(&self) -> &str {
        self.workspace.identity()
    }

    #[must_use]
    pub fn removed_from_lane(&self) -> bool {
        self.lane.is_some()
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate_before_commit(file_id)?;
        self.remove_objects()?;
        self.write_updates()?;
        self.workspace.apply(file_id)
    }

    pub(super) fn validate_before_commit(&self, file_id: &str) -> io::Result<()> {
        self.workspace.validate_before_commit(file_id)?;
        for change in std::iter::once(&self.index)
            .chain(self.staged.iter())
            .chain(self.objects.iter())
            .chain(self.lane.iter())
        {
            regular_file(&self.workspace.root, &change.path)?;
            if fs::read(&change.path)? != change.before {
                return Err(invalid("tagged component model changed before removal"));
            }
        }
        if let Some(history) = &self.history {
            history::validate(&self.workspace.root, history)?;
        }
        Ok(())
    }

    fn remove_objects(&self) -> io::Result<()> {
        for object in &self.objects {
            fs::remove_file(&object.path)?;
            let parent = object.path.parent().ok_or_else(|| invalid("object directory"))?;
            match fs::remove_dir(parent) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::DirectoryNotEmpty => {}
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }

    fn write_updates(&self) -> io::Result<()> {
        fs::write(
            &self.index.path,
            self.index.after.as_ref().ok_or_else(|| invalid("scope index"))?,
        )?;
        if let Some(staged) = &self.staged {
            fs::write(
                &staged.path,
                staged.after.as_ref().ok_or_else(|| invalid("staged config"))?,
            )?;
        }
        if let Some(lane) = &self.lane {
            fs::write(&lane.path, lane.after.as_ref().ok_or_else(|| invalid("lane object"))?)?;
        }
        if let Some(history) = &self.history {
            history::write(history)?;
        }
        Ok(())
    }
}

fn staged_selection(
    root: &Path,
    scope: &str,
    name: &str,
    kind: RowKind,
    lane: Option<&super::Lane>,
) -> io::Result<(Option<Change>, Option<String>)> {
    if !matches!(kind, RowKind::Staged | RowKind::LaneSnap) {
        validate_no_staged(root, scope, name)?;
        return Ok((None, None));
    }
    let (change, staged_version) = staged_change(root, scope, name, lane)?;
    Ok((Some(change), Some(staged_version)))
}

fn lane_change(lane: &super::Lane, scope: &str, name: &str) -> io::Result<Change> {
    let mut value = lane.value.clone();
    let components =
        value["components"].as_array_mut().ok_or_else(|| invalid("lane components"))?;
    let position = unique_position(components, scope, name)?;
    components.remove(position);
    let after = outbound::encode_object(&lane.hash, "Lane", &value)?;
    Ok(Change { path: lane.path.clone(), before: lane.before.clone(), after: Some(after) })
}

fn index_change(
    root: &Path,
    scope: &str,
    name: &str,
    _kind: RowKind,
) -> io::Result<(Change, String)> {
    let path = crate::scope_path(root).join("index.json");
    regular_file(root, &path)?;
    let before = fs::read(&path)?;
    let mut index: Value = crate::parse_jsonc(&before)?;
    let rows =
        if index.is_array() { index.as_array_mut() } else { index["components"].as_array_mut() }
            .ok_or_else(|| invalid("scope components"))?;
    let position = unique_index_position(rows, scope, name)?;
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

fn unique_index_position(rows: &[Value], scope: &str, name: &str) -> io::Result<usize> {
    let mut matching = rows
        .iter()
        .enumerate()
        .filter_map(|(position, row)| {
            (row["isSymlink"] != true && super::lane::matches_component_entry(row, scope, name))
                .then_some(position)
        });
    let position = matching.next().ok_or_else(|| invalid("tagged scope model absent"))?;
    if matching.next().is_some() {
        return Err(invalid("tagged scope model is ambiguous"));
    }
    Ok(position)
}

fn unique_position(rows: &[Value], scope: &str, name: &str) -> io::Result<usize> {
    let mut matching = rows
        .iter()
        .enumerate()
        .filter_map(|(position, row)| {
            super::lane::matches_component_entry(row, scope, name).then_some(position)
        });
    let position = matching.next().ok_or_else(|| invalid("tagged scope model absent"))?;
    if matching.next().is_some() {
        return Err(invalid("tagged scope model is ambiguous"));
    }
    Ok(position)
}

fn object_changes(root: &Path, selection: &ModelSelection<'_>) -> io::Result<Vec<Change>> {
    let dir = crate::scope_path(root).join("objects");
    let model = outbound::read_object(&dir, selection.model_hash, "Component")?;
    let hashes = model_hashes(&model, selection)?;
    let mut changes = Vec::new();
    for hash in hashes {
        let path = dir.join(&hash[..2]).join(&hash[2..]);
        regular_file(root, &path)?;
        changes.push(Change { before: fs::read(&path)?, path, after: None });
    }
    Ok(changes)
}

fn model_hashes(model: &Value, selection: &ModelSelection<'_>) -> io::Result<Vec<String>> {
    validate_model(model, selection)?;
    let versions = model["versions"].as_object();
    let orphaned = model["orphanedVersions"].as_object();
    let mut hashes = vec![selection.model_hash.to_owned()];
    for value in versions
        .into_iter()
        .chain(orphaned)
        .flat_map(serde_json::Map::values)
    {
        let hash = value.as_str().ok_or_else(|| invalid("tagged version ref"))?;
        crate::merge_history::hash(hash)?;
        if !hashes
            .iter()
            .any(|current| current == hash)
        {
            hashes.push(hash.to_owned());
        }
    }
    Ok(hashes)
}

fn staged_change(
    root: &Path,
    scope: &str,
    name: &str,
    lane: Option<&super::Lane>,
) -> io::Result<(Change, String)> {
    let path = if let Some(lane) = lane {
        crate::scope_path(root)
            .join("staged-config")
            .join(&lane.scope)
            .join(format!("{}.json", lane.name))
    } else {
        crate::scope_path(root).join("staged-config/main.json")
    };
    regular_file(root, &path)?;
    let before = fs::read(&path)?;
    let mut staged: Value = crate::parse_jsonc(&before)?;
    let rows = staged.as_array_mut().ok_or_else(|| invalid("staged component config"))?;
    let position = unique_position(rows, scope, name)?;
    let staged_version = rows[position]["id"]["version"]
        .as_str()
        .or_else(|| rows[position]["version"].as_str())
        .or_else(|| {
            rows[position]["id"]
                .as_str()
                .and_then(|raw| raw.rsplit_once('@').map(|(_, ver)| ver))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("staged version"))?
        .to_owned();
    rows.remove(position);
    let after = serde_json::to_vec_pretty(&staged)?;
    Ok((Change { path, before, after: Some(after) }, staged_version))
}

fn validate_no_staged(root: &Path, scope: &str, name: &str) -> io::Result<()> {
    let path = crate::scope_path(root).join("staged-config/main.json");
    if !path.try_exists()? {
        return Ok(());
    }
    regular_file(root, &path)?;
    let value: Value = crate::parse_jsonc(&fs::read(path)?)?;
    let rows = value.as_array().ok_or_else(|| invalid("staged component config"))?;
    if rows.iter().any(|row| super::lane::matches_component_entry(row, scope, name)) {
        return Err(invalid("imported component has staged config"));
    }
    Ok(())
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

fn validate_model(model: &Value, selection: &ModelSelection<'_>) -> io::Result<()> {
    if model
        .get("versions")
        .is_some_and(|val| !val.is_null() && !val.is_object())
    {
        return Err(invalid("Component versions"));
    }
    let version_count = model["versions"].as_object().map_or(0, serde_json::Map::len);
    let model_scope = model["scope"].as_str().unwrap_or_default();
    if (!model_scope.is_empty() && model_scope != selection.scope)
        || model["name"] != selection.name
        || version_count > 65536
    {
        return Err(invalid("unsupported tagged Component model"));
    }
    Ok(())
}
