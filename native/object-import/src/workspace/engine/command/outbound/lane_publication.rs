//! Publish a persisted lane locally only after the remote acknowledges its heads.
mod report;

use super::{
    Prepare, invalid,
    lane_model::{self, LaneSelected},
};
use crate::store::Store;
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
    /// Exhaustive exports may resend versions that the remote already knows.
    allow_subset: bool,
}

struct PublishedState {
    bitmap: Change,
    scope: Change,
    refs: Refs,
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
        acknowledgement: Acknowledgement {
            expected: expected_ids,
            allow_subset: input.options.all || input.options.all_versions,
        },
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
        staged: prepare_staged(root, &selected.components.expected_ids)?,
        report: Reported::prepare(selected)?,
    })
}

impl Prepared {
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
        })
    }
}

fn prepare_objects(root: &Path, selected: &LaneSelected) -> io::Result<Objects> {
    Ok(Objects {
        index: fs::read(root.join(".bit/index.json"))?,
        lane: object_bytes(root, &selected.hashes.lane)?,
        history: object_bytes(root, &selected.hashes.history)?,
        lane_hash: selected.hashes.lane.clone(),
        history_hash: selected.hashes.history.clone(),
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
    let before = fs::read(root.join(".bit/scope.json"))?;
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

fn prepare_staged(root: &Path, expected_ids: &[String]) -> io::Result<Staged> {
    let snaps = read_optional(&root.join(".bit/staged-snaps"))?;
    if snaps
        .as_ref()
        .is_some_and(|bytes| bytes.len() > 4 * 1024 * 1024)
    {
        return Err(invalid("outbound lane staged snap bounds"));
    }
    let before = read_optional(&root.join(".bit/staged-config/main.json"))?;
    let expected = expected_ids
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let config = before
        .map(|before| -> io::Result<Change> {
            let after = export_staged_config(&before, &expected)?;
            Ok(Change { before, after })
        })
        .transpose()?;
    Ok(Staged { snaps, config })
}

impl Prepared {
    pub(super) fn commit(self, exported_ids: &[String]) -> io::Result<()> {
        self.acknowledgement.validate(exported_ids)?;
        self.validate()?;
        self.publish()
    }

    fn validate(&self) -> io::Result<()> {
        if !self.validate_files()? || !self.validate_objects()? {
            return Err(invalid("outbound lane local state changed"));
        }
        for model in &self.models {
            if model.hash.len() != 40 || !model.hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Err(invalid("outbound lane model hash"));
            }
            let path = self.workspace.root
                .join(".bit/objects")
                .join(&model.hash[..2])
                .join(&model.hash[2..]);
            if fs::read(path)? != model.before {
                return Err(invalid("outbound lane local model changed"));
            }
        }
        Ok(())
    }

    fn validate_files(&self) -> io::Result<bool> {
        let root = &self.workspace.root;
        Ok(fs::read(root.join(".bitmap"))? == self.published.bitmap.before
            && fs::read(root.join(".bit/scope.json"))? == self.published.scope.before
            && read_optional(&refs_path(root, &self.lane.scope, &self.lane.name))?
                == self.published.refs.before
            && read_optional(&root.join(".bit/staged-snaps"))? == self.staged.snaps
            && read_optional(&root.join(".bit/staged-config/main.json"))?
                == self.staged.config.as_ref().map(|config| config.before.clone()))
    }

    fn validate_objects(&self) -> io::Result<bool> {
        let root = &self.workspace.root;
        Ok(fs::read(root.join(".bit/index.json"))? == self.objects.index
            && object_bytes(root, &self.objects.lane_hash)? == self.objects.lane
            && object_bytes(root, &self.objects.history_hash)? == self.objects.history)
    }

    fn publish(self) -> io::Result<()> {
        let store = Store::new(self.workspace.root.join(".bit/objects"), None)?;
        for model in &self.models {
            store.write(&model.hash, &model.after)?;
        }
        if let Some(refs) = &self.published.refs.after {
            write(&refs_path(&self.workspace.root, &self.lane.scope, &self.lane.name), refs)?;
        }
        if let Some(config) = &self.staged.config {
            fs::write(self.workspace.root.join(".bit/staged-config/main.json"), &config.after)?;
        }
        if self.staged.snaps.is_some() {
            fs::remove_file(self.workspace.root.join(".bit/staged-snaps"))?;
        }
        fs::write(self.workspace.root.join(".bit/scope.json"), &self.published.scope.after)?;
        if self.published.bitmap.after != self.published.bitmap.before {
            self.backup_bitmap()?;
            write(&self.workspace.root.join(".bitmap"), &self.published.bitmap.after)?;
        }
        Ok(())
    }

    fn backup_bitmap(&self) -> io::Result<()> {
        let directory = self.workspace.root.join(".bit/bitmap-history");
        fs::create_dir_all(&directory)?;
        fs::write(
            directory.join(format!(".bitmap-{}", self.workspace.file_id)),
            &self.published.bitmap.before,
        )?;
        let mut metadata = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.workspace.root.join(".bit/bitmap-history-metadata.txt"))?;
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
        if acknowledged.len() != exported_ids.len()
            || !acknowledged.is_subset(&self.expected)
            || (!self.allow_subset && acknowledged != self.expected)
        {
            return Err(invalid("outbound lane remote acknowledgement"));
        }
        Ok(())
    }
}

fn export_bitmap(before: &[u8], scope: &str, name: &str, lane: &Value) -> io::Result<Vec<u8>> {
    let mut bitmap = crate::recovery::jsonc::parse(before)?;
    let header =
        bitmap.get_mut("_bit_lane").ok_or_else(|| invalid("outbound lane bitmap header"))?;
    if header["id"]["name"] != name
        || header["id"]["scope"] != scope
        || header
            .get("exported")
            .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("outbound lane bitmap identity"));
    }
    let mut changed = header["exported"] != true;
    header["exported"] = Value::Bool(true);
    let components =
        lane["components"].as_array().ok_or_else(|| invalid("outbound lane bitmap components"))?;
    for component in components {
        let component_scope = component["id"]["scope"]
            .as_str()
            .ok_or_else(|| invalid("outbound lane bitmap scope"))?;
        let component_name =
            component["id"]["name"].as_str().ok_or_else(|| invalid("outbound lane bitmap name"))?;
        if let Some(row) = bitmap.get_mut(component_name)
            && row["scope"] == ""
        {
            row["scope"] = Value::String(component_scope.to_owned());
            row.as_object_mut()
                .ok_or_else(|| invalid("outbound lane bitmap row"))?
                .remove("defaultScope");
            changed = true;
        }
    }
    if changed { crate::inspection::render_bitmap(&bitmap) } else { Ok(before.to_vec()) }
}

fn export_scope(before: &[u8], name: &str) -> io::Result<Vec<u8>> {
    let mut scope: Value = serde_json::from_slice(before)?;
    let new =
        scope["lanes"]["new"].as_array_mut().ok_or_else(|| invalid("outbound lane scope state"))?;
    if new.len() > 4096 {
        return Err(invalid("outbound lane scope bounds"));
    }
    new.retain(|entry| entry != name);
    let mut output = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
    let mut serializer = serde_json::Serializer::with_formatter(&mut output, formatter);
    serde::Serialize::serialize(&scope, &mut serializer)?;
    Ok(output)
}

fn export_staged_config(before: &[u8], expected_ids: &HashSet<String>) -> io::Result<Vec<u8>> {
    let mut rows: Vec<Value> = serde_json::from_slice(before)?;
    if rows.len() > 4096 {
        return Err(invalid("outbound lane staged configuration bounds"));
    }
    let old_len = rows.len();
    rows.retain(|row| {
        let (Some(scope), Some(name)) = (row["id"]["scope"].as_str(), row["id"]["name"].as_str())
        else {
            return true;
        };
        !expected_ids
            .iter()
            .any(|id| id.starts_with(&format!("{scope}/{name}@")))
    });
    if rows.len() == old_len {
        return Ok(before.to_vec());
    }
    serde_json::to_vec_pretty(&rows).map_err(io::Error::other)
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
    root.join(".bit/refs/remotes")
        .join(scope)
        .join(name)
}

fn object_bytes(root: &Path, hash: &str) -> io::Result<Vec<u8>> {
    if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid("outbound lane object hash"));
    }
    fs::read(
        root.join(".bit/objects")
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
