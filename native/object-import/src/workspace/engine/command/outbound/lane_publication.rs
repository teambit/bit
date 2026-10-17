//! Publish a persisted lane locally only after the remote acknowledges its heads.
mod controls;
mod report;
mod state;

use super::{
    Prepare, invalid,
    lane_model::{self, LaneSelected},
};
use crate::store::Store;
use controls::{export_bitmap, export_scope, export_staged_config};
use rayon::prelude::*;
use report::Reported;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

pub(super) struct Prepared {
    workspace: Workspace,
    lane: Lane,
    acknowledgement: Acknowledgement,
    objects: Objects,
    models: Vec<Model>,
    published: PublishedState,
    staged: Staged,
    report: Reported,
}

struct Acknowledgement {
    expected: HashSet<String>,
}

struct PublishedState {
    bitmap: Change,
    scope: Change,
    refs: Refs,
    staged: bool,
    updated_ids: Vec<String>,
    non_existing_ids: Vec<String>,
}

struct Workspace {
    root: PathBuf,
    file_id: String,
}

struct Lane {
    scope: String,
    name: String,
}

struct Objects {
    index: Vec<u8>,
    lane: Vec<u8>,
    history: Vec<u8>,
    lane_hash: String,
    history_hash: String,
    version_histories: Vec<super::model::HistoryBytes>,
}

struct Change {
    before: Vec<u8>,
    after: Vec<u8>,
}

struct Refs {
    before: Option<Vec<u8>>,
    after: Option<Vec<u8>>,
}

struct Staged {
    snaps: Option<Vec<u8>>,
    config: Option<Change>,
    config_path: PathBuf,
}

struct Model {
    hash: String,
    before: Vec<u8>,
    after: Vec<u8>,
}

pub(super) fn prepare(input: &Prepare, selected: &LaneSelected) -> io::Result<Prepared> {
    let root = &input.root;
    safe_segment(&selected.scope)?;
    safe_segment(&selected.name)?;
    super::super::bitmap::validate_history_file_id(&input.transport.bitmap_history_file_id)?;
    if selected.lane["scope"] != selected.scope || selected.lane["name"] != selected.name {
        return Err(invalid("outbound lane publication identity"));
    }
    let expected_ids = selected.components.expected_ids
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    if expected_ids.len() != selected.components.expected_ids.len() {
        return Err(invalid("outbound lane publication acknowledgement"));
    }
    Ok(Prepared {
        workspace: Workspace {
            root: root.clone(),
            file_id: input.transport.bitmap_history_file_id.clone(),
        },
        lane: Lane { scope: selected.scope.clone(), name: selected.name.clone() },
        acknowledgement: Acknowledgement { expected: expected_ids },
        objects: prepare_objects(root, selected)?,
        models: selected.components.models
            .iter()
            .map(|model| Model {
                hash: model.hash.clone(),
                before: model.before.clone(),
                after: model.after.clone(),
            })
            .collect(),
        published: PublishedState::prepare(root, selected)?,
        staged: prepare_staged(root, selected)?,
        report: Reported::prepare(selected)?,
    })
}

impl Prepared {
    pub(super) fn non_existing_ids(&self) -> &[String] {
        &self.published.non_existing_ids
    }

    pub(super) fn stage_history(&self) -> io::Result<()> {
        let store = Store::new(crate::scope_path(&self.workspace.root).join("objects"), None)?;
        for history in &self.objects.version_histories {
            store.write(&history.hash, &history.bytes)?;
        }
        Ok(())
    }

    pub(super) fn update_ids(&self) -> &[String] {
        &self.report.updates
    }

    pub(super) fn removed_ids(&self) -> &[String] {
        &self.report.removed
    }
}

impl PublishedState {
    fn prepare(root: &Path, selected: &LaneSelected) -> io::Result<Self> {
        Ok(Self {
            bitmap: prepare_bitmap(root, selected)?,
            scope: prepare_scope(root, selected)?,
            refs: prepare_refs(root, selected)?,
            staged: false,
            updated_ids: Vec::new(),
            non_existing_ids: Vec::new(),
        })
    }
}

fn prepare_objects(root: &Path, selected: &LaneSelected) -> io::Result<Objects> {
    Ok(Objects {
        index: fs::read(crate::scope_path(root).join("index.json"))?,
        lane: object_bytes(root, &selected.hashes.lane)?,
        history: object_bytes(root, &selected.hashes.history)?,
        lane_hash: selected.hashes.lane.clone(),
        history_hash: selected.hashes.history.clone(),
        version_histories: selected.components.histories.clone(),
    })
}

fn prepare_bitmap(root: &Path, selected: &LaneSelected) -> io::Result<Change> {
    let before = fs::read(root.join(".bitmap"))?;
    if before.len() > 4 * 1024 * 1024 {
        return Err(invalid("outbound lane bitmap bounds"));
    }
    let after = export_bitmap(&before, &selected.scope, &selected.name, &selected.lane)?;
    Ok(Change { before, after })
}

fn prepare_scope(root: &Path, selected: &LaneSelected) -> io::Result<Change> {
    let before = fs::read(crate::scope_path(root).join("scope.json"))?;
    if before.len() > 4 * 1024 * 1024 {
        return Err(invalid("outbound lane scope bounds"));
    }
    let after = export_scope(&before, &selected.name)?;
    Ok(Change { before, after })
}

fn prepare_refs(root: &Path, selected: &LaneSelected) -> io::Result<Refs> {
    let components: Vec<Value> = lane_model::lane_entries(&selected.lane)?
        .iter()
        .map(|entry| json!({"id":entry["id"],"head":entry["head"]}))
        .collect();
    if components.len() > 4096 {
        return Err(invalid("outbound lane publication bounds"));
    }
    let before = read_optional(&refs_path(root, &selected.scope, &selected.name))?;
    if components.is_empty() && before.is_some() {
        return Err(invalid("outbound empty lane remote refs require canonical export"));
    }
    let after =
        if components.is_empty() { None } else { Some(serde_json::to_vec_pretty(&components)?) };
    Ok(Refs { before, after })
}

fn prepare_staged(root: &Path, selected: &LaneSelected) -> io::Result<Staged> {
    let snaps = read_optional(&crate::scope_path(root).join("staged-snaps"))?;
    if snaps
        .as_ref()
        .is_some_and(|bytes| bytes.len() > 4 * 1024 * 1024)
    {
        return Err(invalid("outbound lane staged snap bounds"));
    }
    let config_path = crate::scope_path(root)
        .join("staged-config")
        .join(&selected.scope)
        .join(format!("{}.json", selected.name));
    let before = read_optional(&config_path)?;
    let expected = selected.components.expected_ids
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let config = before
        .map(|before| -> io::Result<Change> {
            let after = export_staged_config(&before, &expected)?;
            Ok(Change { before, after })
        })
        .transpose()?;
    Ok(Staged { snaps, config, config_path })
}

impl Prepared {
    pub(super) fn commit(mut self, exported_ids: &[String]) -> io::Result<()> {
        self.stage(exported_ids)?;
        self.finish()
    }

    pub(super) fn stage(&mut self, exported_ids: &[String]) -> io::Result<Vec<String>> {
        if self.published.staged {
            return Ok(self.published.updated_ids.clone());
        }
        self.acknowledgement.validate(exported_ids)?;
        self.validate()?;
        self.reconcile(exported_ids)?;
        let store = Store::new(crate::scope_path(&self.workspace.root).join("objects"), None)?;
        self.models
            .par_iter()
            .try_for_each(|model| store.write(&model.hash, &model.after))?;
        for model in &mut self.models {
            model.before.clone_from(&model.after);
        }
        if let Some(refs) = &self.published.refs.after {
            write(&refs_path(&self.workspace.root, &self.lane.scope, &self.lane.name), refs)?;
            self.published.refs.before = Some(refs.clone());
        }
        fs::write(
            crate::scope_path(&self.workspace.root).join("scope.json"),
            &self.published.scope.after,
        )?;
        self.published.scope.before.clone_from(&self.published.scope.after);
        self.published.staged = true;
        Ok(self.published.updated_ids.clone())
    }

    pub(super) fn finish(self) -> io::Result<()> {
        if !self.published.staged {
            return Err(invalid("outbound lane scope publication not staged"));
        }
        self.validate()?;
        self.publish_controls()
    }

    fn publish_controls(self) -> io::Result<()> {
        if let Some(config) = &self.staged.config {
            fs::write(&self.staged.config_path, &config.after)?;
        }
        if self.staged.snaps.is_some() {
            fs::remove_file(crate::scope_path(&self.workspace.root).join("staged-snaps"))?;
        }
        let last_merged = crate::scope_path(&self.workspace.root).join("last-merged");
        crate::workspace::actions::remove(&last_merged)?;
        if self.published.bitmap.after != self.published.bitmap.before {
            self.backup_bitmap()?;
            write(&self.workspace.root.join(".bitmap"), &self.published.bitmap.after)?;
        }
        Ok(())
    }

    fn backup_bitmap(&self) -> io::Result<()> {
        let directory = crate::scope_path(&self.workspace.root).join("bitmap-history");
        fs::create_dir_all(&directory)?;
        fs::write(
            directory.join(format!(".bitmap-{}", self.workspace.file_id)),
            &self.published.bitmap.before,
        )?;
        let mut metadata = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(crate::scope_path(&self.workspace.root).join("bitmap-history-metadata.txt"))?;
        writeln!(metadata, "{} export", self.workspace.file_id)?;
        metadata.sync_all()
    }
}

impl Acknowledgement {
    fn validate(&self, exported_ids: &[String]) -> io::Result<()> {
        let acknowledged = exported_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>();
        if acknowledged.len() != exported_ids.len() || !acknowledged.is_subset(&self.expected) {
            return Err(invalid("outbound lane remote acknowledgement"));
        }
        Ok(())
    }
}

fn safe_segment(segment: &str) -> io::Result<()> {
    if segment.is_empty()
        || segment == "."
        || segment == ".."
        || segment
            .bytes()
            .any(|byte| matches!(byte, b'/' | b'\\' | 0))
    {
        return Err(invalid("outbound lane ref path"));
    }
    Ok(())
}

fn refs_path(root: &Path, scope: &str, name: &str) -> PathBuf {
    crate::scope_path(root)
        .join("refs/remotes")
        .join(scope)
        .join(name)
}

fn object_bytes(root: &Path, hash: &str) -> io::Result<Vec<u8>> {
    if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid("outbound lane object hash"));
    }
    fs::read(
        crate::scope_path(root)
            .join("objects")
            .join(&hash[..2])
            .join(&hash[2..]),
    )
}

fn read_optional(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(path.parent().ok_or_else(|| invalid("outbound lane write parent"))?)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}
