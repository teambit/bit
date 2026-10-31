//! Plan the local bitmap and file effects of `bit delete --silent` on main or an exported lane.

pub use batch::Batch;
pub use policy::{DependencyComponent, Pin};

mod batch;
mod policy;
#[cfg(test)]
mod tests;

use crate::{component_remove, inspection, recovery, workspace::engine::command::outbound};
use component_remove::{RowKind, backup_bitmap, select, validate_directory, validate_file_id};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub enum Scope {
    Entire,
    Range(String),
    Snaps(Vec<String>),
}

pub struct Plan {
    root: PathBuf,
    bitmap: BitmapChange,
    repository: RepositorySnapshot,
    files: Option<PathBuf>,
    package: PathBuf,
    full_id: String,
    entire: bool,
}

struct BitmapChange {
    before: Vec<u8>,
    after: Vec<u8>,
}

struct RepositorySnapshot {
    index_before: Vec<u8>,
    objects: Vec<FrozenObject>,
    policy: policy::Decision,
}

struct FrozenObject {
    path: PathBuf,
    before: Vec<u8>,
}

impl Plan {
    pub fn prepare(root: &Path, name: &str, scope: Scope) -> io::Result<Self> {
        Self::prepare_with(root, name, scope, false, None, false)
    }

    pub fn prepare_lane(root: &Path, name: &str, scope: Scope) -> io::Result<Self> {
        Self::prepare_with(root, name, scope, true, None, false)
    }

    pub fn prepare_lane_with_dependencies(
        root: &Path,
        name: &str,
        scope: Scope,
        components: &[DependencyComponent],
    ) -> io::Result<Self> {
        Self::prepare_with(root, name, scope, true, Some(components), false)
    }

    pub fn needs_dependency_graph(root: &Path) -> io::Result<bool> {
        let bitmap = recovery::jsonc::parse(&fs::read(root.join(".bitmap"))?)?;
        Ok(component_count(&bitmap)? > 1)
    }

    fn prepare_with(
        root: &Path,
        name: &str,
        scope: Scope,
        lane: bool,
        components: Option<&[DependencyComponent]>,
        update_main: bool,
    ) -> io::Result<Self> {
        validate_scope(root, &scope)?;
        let before = fs::read(root.join(".bitmap"))?;
        let mut bitmap = recovery::jsonc::parse(&before)?;
        let entire = matches!(scope, Scope::Entire);
        let selected =
            select_target(root, &bitmap, name, &scope, lane, components.is_some(), update_main)?;
        let version = selected.version.as_deref().ok_or_else(|| invalid("component version"))?;
        let mut repository = if let Some(lane) = &selected.lane {
            lane_state(root, lane, version)?
        } else {
            model_state(root, &selected.identity, version)?
        };
        if lane && entire && !update_main {
            repository.policy =
                policy::plan(root, &bitmap, &selected, components, &mut repository.objects)
                    .unwrap_or_default();
        }
        let after = project_bitmap(&mut bitmap, &selected.key, scope, update_main)?;
        Ok(Self {
            root: root.to_owned(),
            bitmap: BitmapChange { before, after },
            repository,
            files: selected.files,
            package: selected.package,
            full_id: format!("{}@{version}", selected.identity),
            entire,
        })
    }

    #[must_use]
    pub fn full_id(&self) -> &str {
        &self.full_id
    }
    #[must_use]
    pub fn entire(&self) -> bool {
        self.entire
    }

    #[must_use]
    pub fn pin(&self) -> Option<&Pin> {
        self.repository.policy.pin.as_ref()
    }

    #[must_use]
    pub fn policy_loaded(&self) -> bool {
        self.repository.policy.loaded
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate(file_id)?;
        if self.entire && self.package.try_exists()? {
            fs::remove_dir_all(&self.package)?;
        }
        backup_bitmap(&self.root, file_id, "delete")?;
        fs::write(self.root.join(".bitmap"), &self.bitmap.after)?;
        crate::component_remove::remove_source_paths(self.files.as_deref())
    }

    fn validate(&self, file_id: &str) -> io::Result<()> {
        validate_file_id(file_id)?;
        if fs::read(self.root.join(".bitmap"))? != self.bitmap.before
            || fs::read(crate::scope_path(&self.root).join("index.json"))?
                != self.repository.index_before
        {
            return Err(invalid("component workspace changed before deletion"));
        }
        for object in &self.repository.objects {
            if fs::read(&object.path)? != object.before {
                return Err(invalid("component object changed before deletion"));
            }
        }
        if let Some(path) = &self.files {
            validate_directory(path)?;
        }
        if self.entire && self.package.try_exists()? {
            validate_directory(&self.package)?;
        }
        Ok(())
    }
}

fn select_target(
    root: &Path,
    bitmap: &Value,
    name: &str,
    scope: &Scope,
    lane: bool,
    _graph: bool,
    update_main: bool,
) -> io::Result<component_remove::Selected> {
    let keep_files = !matches!(scope, Scope::Entire);
    if update_main && !bitmap["_bit_lane"].is_null() {
        let mut main = bitmap.clone();
        main.as_object_mut()
            .ok_or_else(|| invalid("component bitmap"))?
            .shift_remove("_bit_lane");
        for row in main
            .as_object_mut()
            .ok_or_else(|| invalid("component bitmap"))?
            .values_mut()
        {
            if let Some(row) = row.as_object_mut() {
                row.shift_remove("onLanesOnly");
                row.shift_remove("isAvailableOnCurrentLane");
            }
        }
        return select(root, &main, name, keep_files, RowKind::Staged)
            .or_else(|_| select(root, &main, name, keep_files, RowKind::Imported));
    }
    if !lane {
        return select(root, bitmap, name, keep_files, RowKind::Staged)
            .or_else(|_| select(root, bitmap, name, keep_files, RowKind::Imported));
    }
    if matches!(scope, Scope::Range(_)) {
        return Err(invalid("range selection is not supported on a lane"));
    }
    select(root, bitmap, name, keep_files, RowKind::ExportedLane)
}

fn component_count(bitmap: &Value) -> io::Result<usize> {
    Ok(bitmap
        .as_object()
        .ok_or_else(|| invalid("component bitmap"))?
        .keys()
        .filter(|key| !key.starts_with('$') && *key != "_bit_lane" && *key != "version")
        .count())
}

fn project_bitmap(
    bitmap: &mut Value,
    key: &str,
    scope: Scope,
    update_main: bool,
) -> io::Result<Vec<u8>> {
    let mut config = json!({"removed":matches!(scope, Scope::Entire)});
    if update_main {
        config["removeOnMain"] = json!(true);
    }
    match scope {
        Scope::Range(range) => config["range"] = json!(range),
        Scope::Snaps(snaps) if !snaps.is_empty() => config["snaps"] = json!(snaps),
        Scope::Snaps(_) => {}
        Scope::Entire => {}
    }
    if !bitmap[key]["config"].is_object() {
        bitmap[key]["config"] = json!({});
    }
    if let Some(cfg) = bitmap[key]["config"].as_object_mut() {
        cfg.retain(|cfg_key, _| !cfg_key.starts_with("teambit.component/remove@"));
    }
    bitmap[key]["config"]["teambit.component/remove"] = config;
    inspection::render_workspace_bitmap(bitmap)
}

fn validate_scope(_root: &Path, scope: &Scope) -> io::Result<()> {
    match scope {
        Scope::Entire => Ok(()),
        Scope::Range(range) if !range.is_empty() && range.len() <= 65536 => Ok(()),
        Scope::Snaps(snaps)
            if snaps.len() <= 4096
                && snaps
                    .iter()
                    .all(|snap| snap.len() <= 4096) =>
        {
            Ok(())
        }
        _ => Err(invalid("unsupported deletion selection")),
    }
}

fn model_state(root: &Path, identity: &str, version: &str) -> io::Result<RepositorySnapshot> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("component identity"))?;
    let index_before = fs::read(crate::scope_path(root).join("index.json"))?;
    let index: Value = serde_json::from_slice(&index_before)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("scope index"))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        .collect();
    if matches.len() != 1 || matches[0]["isSymlink"] != false {
        return Err(invalid("component is not uniquely indexed"));
    }
    let model_hash = matches[0]["hash"].as_str().ok_or_else(|| invalid("Component hash"))?;
    crate::merge_history::hash(model_hash)?;
    let model = freeze(root, model_hash)?;
    let value =
        outbound::read_object(&crate::scope_path(root).join("objects"), model_hash, "Component")?;
    if value["scope"] != scope || value["name"] != name {
        return Err(invalid("Component model identity"));
    }
    let hash = value["versions"][version]
        .as_str()
        .or_else(|| (version.len() == 40).then_some(version))
        .ok_or_else(|| invalid("component version is not in model"))?;
    crate::merge_history::hash(hash)?;
    let version_object = freeze(root, hash)?;
    let _value = outbound::read_object(&crate::scope_path(root).join("objects"), hash, "Version")?;
    Ok(RepositorySnapshot {
        index_before,
        objects: vec![model, version_object],
        policy: policy::Decision::default(),
    })
}

fn lane_state(
    root: &Path,
    lane: &component_remove::Lane,
    version: &str,
) -> io::Result<RepositorySnapshot> {
    let index_before = fs::read(crate::scope_path(root).join("index.json"))?;
    let stored_lane = freeze(root, &lane.hash)?;
    if stored_lane.before != lane.before || index_before != lane.index_before {
        return Err(invalid("current lane changed during selection"));
    }
    crate::merge_history::hash(version)?;
    let version_object = freeze(root, version)?;
    let _value =
        outbound::read_object(&crate::scope_path(root).join("objects"), version, "Version")?;
    Ok(RepositorySnapshot {
        index_before,
        objects: vec![stored_lane, version_object],
        policy: policy::Decision::default(),
    })
}

fn freeze(root: &Path, hash: &str) -> io::Result<FrozenObject> {
    let path = crate::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let kind = fs::symlink_metadata(&path)?.file_type();
    if !kind.is_file() || kind.is_symlink() {
        return Err(invalid("component object path"));
    }
    Ok(FrozenObject { before: fs::read(&path)?, path })
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
