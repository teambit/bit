//! File-scope side of the published remote hard-delete operations.
//!
//! The legacy repository removes Component and tagged Version refs only. Source,
//! `VersionHistory`, orphaned Version and Lane references intentionally survive.

mod graph;
mod lane;
mod readset;

#[cfg(test)]
mod tests;

use crate::store::Store;
use readset::Readset;
use serde_json::{Map, Value, json};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

pub struct Plan {
    scope: PathBuf,
    before_index: Vec<u8>,
    index: Value,
    refs: Vec<String>,
    selected: Selection,
    unmerged: Option<(Vec<u8>, Vec<u8>)>,
    lanes: bool,
    basis: Basis,
}

struct Basis {
    guard: ScopeGuard,
    readset: Readset,
}

/// Scope metadata is checked before any remote group is launched and again before a write.
pub struct ScopeGuard {
    scope: PathBuf,
    legacy: Vec<u8>,
}

impl ScopeGuard {
    pub fn prepare(scope: &Path) -> io::Result<Self> {
        let legacy = fs::read(scope.join("scope.json"))?;
        if legacy.len() > 1024 * 1024 {
            return Err(invalid("remote scope metadata budget"));
        }
        let value: Value = crate::parse_jsonc(&legacy)?;
        if value["hooksPath"] != Value::Null
            || value["resolverPath"] != Value::Null
            || (!value["config"].is_null()
                && !value["config"].as_object().is_some_and(Map::is_empty))
        {
            return Err(invalid("custom file-scope hooks or resolver"));
        }
        if scope.join("scope.jsonc").try_exists()? {
            return Err(invalid("custom file-scope aspects"));
        }
        Ok(Self { scope: scope.into(), legacy })
    }

    pub fn validate(&self) -> io::Result<()> {
        if fs::read(self.scope.join("scope.json"))? != self.legacy
            || self.scope.join("scope.jsonc").try_exists()?
        {
            return Err(invalid("remote scope configuration changed before deletion"));
        }
        Ok(())
    }
}

struct Selection {
    removed: Vec<String>,
    missing: Vec<String>,
    dependent: Value,
}

struct LoadedComponents {
    found: Vec<(String, Value, String)>,
    missing: Vec<String>,
}

impl Plan {
    /// Prepare `Scope.removeMany` without modifying the remote.
    pub fn components(scope: &Path, ids: &[String], force: bool) -> io::Result<Self> {
        let guard = ScopeGuard::prepare(scope)?;
        let mut readset = Readset::new(scope);
        let (before_index, mut index) = read_index(scope)?;
        let LoadedComponents { found, missing } = load_components(&mut readset, &index, ids)?;
        let dependent =
            if force { json!({}) } else { graph::dependents(&mut readset, &index, &found)? };
        if dependent
            .as_object()
            .is_some_and(|rows| !rows.is_empty())
        {
            return Ok(Self {
                scope: scope.into(),
                before_index,
                index,
                refs: Vec::new(),
                selected: Selection { removed: Vec::new(), missing, dependent },
                unmerged: None,
                lanes: false,
                basis: Basis { guard, readset },
            });
        }
        let (removed, refs) = select_refs(found)?;
        for hash in &refs {
            readset.watch_hash(hash)?;
        }
        remove_index_refs(&mut index, &refs)?;
        let unmerged = unmerged(scope, &removed)?;
        Ok(Self {
            scope: scope.into(),
            before_index,
            index,
            refs,
            selected: Selection { removed, missing, dependent },
            unmerged,
            lanes: false,
            basis: Basis { guard, readset },
        })
    }

    /// Prepare `Lanes.removeLanes` on a bare remote scope.
    pub fn lanes(scope: &Path, ids: &[String], force: bool) -> io::Result<Self> {
        lane::prepare(scope, ids, force)
    }

    #[must_use]
    pub fn receipt(&self) -> Value {
        json!({"removedComponentIds":if self.lanes { Vec::new() } else { self.selected.removed.clone() },
            "missingComponents":self.selected.missing,
            "dependentBits":self.selected.dependent,"removedFromLane":[],"removedLanes":
            if self.lanes { self.selected.removed.clone() } else { Vec::new() }})
    }

    /// Commit once. A caller must never delegate or retry after entering this method.
    pub fn commit(&self) -> io::Result<()> {
        self.validate()?;
        if self.refs.is_empty() {
            return Ok(());
        }
        let objects = self.scope.join("objects");
        let store = Store::new(objects.clone(), None)?;
        store.validate_index_write()?;
        self.remove_refs(&objects)?;
        self.publish(&store)
    }

    /// Reject stale planning input before any remote group is launched.
    pub fn validate(&self) -> io::Result<()> {
        self.basis.guard.validate()?;
        self.basis.readset.validate()?;
        if fs::read(self.scope.join("index.json"))? != self.before_index {
            return Err(invalid("remote index changed before deletion"));
        }
        if let Some((before, _)) = &self.unmerged
            && fs::read(self.scope.join("unmerged.json"))? != *before
        {
            return Err(invalid("remote unmerged records changed before deletion"));
        }
        Ok(())
    }

    fn remove_refs(&self, objects: &Path) -> io::Result<()> {
        for hash in &self.refs {
            let path = object_path(objects, hash);
            if self.lanes {
                move_lane_ref(&self.scope, hash, path)?;
            } else {
                remove_component_ref(&path)?;
            }
        }
        Ok(())
    }

    fn publish(&self, store: &Store) -> io::Result<()> {
        if self.index != crate::parse_jsonc(&self.before_index)? {
            let mut bytes = serde_json::to_vec_pretty(&self.index)?;
            bytes.push(b'\n');
            store.write_index(&bytes)?;
        }
        if let Some((_, after)) = &self.unmerged {
            Store::write_metadata(&self.scope.join("unmerged.json"), after)?;
        }
        Ok(())
    }
}

fn move_lane_ref(scope: &Path, hash: &str, path: PathBuf) -> io::Result<()> {
    let target = object_path(&scope.join("trash"), hash);
    fs::create_dir_all(target.parent().ok_or_else(|| invalid("trash path"))?)?;
    if target.try_exists()? {
        fs::remove_file(&target)?;
    }
    fs::rename(path, target)
}

fn remove_component_ref(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => {
            if let Some(parent) = path.parent() {
                let _ = fs::remove_dir(parent);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    Ok(())
}

fn load_components(
    readset: &mut Readset,
    index: &Value,
    ids: &[String],
) -> io::Result<LoadedComponents> {
    let mut found = Vec::new();
    let mut missing = Vec::new();
    for id in ids {
        let identity = identity(id)?;
        if let Some(row) = component_row(index, identity) {
            if row["isSymlink"] == true {
                return Err(invalid("remote symlink hard-delete"));
            }
            let component_hash = hash(&row["hash"])?;
            let component = readset.read(component_hash, "Component")?;
            found.push((identity.to_owned(), component, component_hash.to_owned()));
        } else {
            missing.push(format!("{identity}@latest"));
        }
    }
    Ok(LoadedComponents { found, missing })
}

fn select_refs(found: Vec<(String, Value, String)>) -> io::Result<(Vec<String>, Vec<String>)> {
    let mut removed = Vec::new();
    let mut refs = Vec::new();
    for (identity, component, component_hash) in found {
        if component
            .get("versions")
            .is_some_and(|val| !val.is_null() && !val.is_object())
        {
            return Err(invalid("component versions"));
        }
        let versions = component["versions"].as_object();
        let orphaned = component["orphanedVersions"].as_object();
        removed.push(format!("{identity}@latest"));
        refs.push(component_hash);
        for version in versions
            .into_iter()
            .chain(orphaned)
            .flat_map(serde_json::Map::values)
        {
            refs.push(hash(version)?.to_owned());
        }
    }
    Ok((removed, unique(refs)))
}

pub(super) fn read_index(scope: &Path) -> io::Result<(Vec<u8>, Value)> {
    let bytes = fs::read(scope.join("index.json"))?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err(invalid("remote index budget"));
    }
    let index = crate::parse_jsonc(&bytes)?;
    Ok((bytes, index))
}
pub(super) fn identity(id: &str) -> io::Result<&str> {
    let plain = id.split_once('@').map_or(id, |(name, _)| name);
    let (scope, name) = plain.split_once('/').ok_or_else(|| invalid("remote component id"))?;
    if scope.is_empty() || name.is_empty() || name.contains("..") {
        return Err(invalid("remote component id"));
    }
    Ok(plain)
}
pub(super) fn row_id_parts(id: &Value) -> (&str, &str) {
    if let Some(raw) = id.as_str() {
        let bare = raw.rsplit_once('@').map_or(raw, |(base, _)| base);
        return bare
            .split_once('/')
            .unwrap_or(("", bare));
    }
    let scope = id["scope"].as_str().unwrap_or_default();
    let name = id["name"]
        .as_str()
        .map(|nm| nm.rsplit_once('@').map_or(nm, |(base, _)| base))
        .unwrap_or_default();
    (scope, name)
}
pub(super) fn component_row<'a>(index: &'a Value, id: &str) -> Option<&'a Value> {
    let (scope, name) = id.split_once('/')?;
    let rows = index["components"].as_array().or_else(|| index.as_array())?;
    let matches_id = |row: &&Value| {
        let (row_scope, row_name) = row_id_parts(&row["id"]);
        (row_scope == scope || row_scope.is_empty()) && row_name == name
    };
    rows.iter()
        .find(|row| row["isSymlink"] != true && matches_id(row))
        .or_else(|| rows.iter().find(matches_id))
}
pub(super) fn hash(value: &Value) -> io::Result<&str> {
    let text = value.as_str().ok_or_else(|| invalid("object hash"))?;
    if text.len() != 40
        || !text
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(invalid("object hash"));
    }
    Ok(text)
}
pub(super) fn object_path(objects: &Path, hash: &str) -> PathBuf {
    objects
        .join(&hash[..2])
        .join(&hash[2..])
}
pub(super) fn unique(refs: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    refs.into_iter()
        .filter(|hash| seen.insert(hash.clone()))
        .collect()
}
pub(super) fn remove_index_refs(index: &mut Value, refs: &[String]) -> io::Result<()> {
    if let Some(rows) = index.as_array_mut() {
        rows.retain(|row| !selected_ref(row, refs));
        return Ok(());
    }
    let components =
        index["components"].as_array_mut().ok_or_else(|| invalid("remote index rows"))?;
    components.retain(|row| !selected_ref(row, refs));
    if let Some(lanes) = index.get_mut("lanes").and_then(Value::as_array_mut) {
        lanes.retain(|row| !selected_ref(row, refs));
    }
    Ok(())
}
fn selected_ref(row: &Value, refs: &[String]) -> bool {
    row["hash"]
        .as_str()
        .is_some_and(|hash| refs.iter().any(|item| item == hash))
}
fn unmerged(scope: &Path, removed: &[String]) -> io::Result<Option<(Vec<u8>, Vec<u8>)>> {
    let path = scope.join("unmerged.json");
    let before = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut value = crate::recovery::jsonc::parse(&before)?;
    let rows = value.as_array_mut().ok_or_else(|| invalid("remote unmerged records"))?;
    let count = rows.len();
    rows.retain(|row| {
        !removed
            .iter()
            .any(|id| {
                let target = id.split('@').next().unwrap_or(id);
                matches_unmerged_row(row, target)
            })
    });
    if count == rows.len() {
        return Ok(None);
    }
    Ok(Some((before, serde_json::to_vec_pretty(&value)?)))
}
fn matches_unmerged_row(row: &Value, target: &str) -> bool {
    if let Some(raw) = row["id"].as_str() {
        let base = raw.split('@').next().unwrap_or(raw);
        let target_name = target.split_once('/').map_or(target, |(_, name)| name);
        return base == target || base == target_name;
    }
    let row_scope = row["id"]["scope"].as_str().unwrap_or_default();
    let row_name = row["id"]["name"].as_str().unwrap_or_default();
    let (target_scope, target_name) = target
        .split_once('/')
        .unwrap_or(("", target));
    row_name == target_name && (row_scope.is_empty() || row_scope == target_scope)
}
pub(super) fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
