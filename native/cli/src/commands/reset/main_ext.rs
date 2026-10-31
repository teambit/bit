//! Main-lane reset diagnostics and detached-head recovery.

use crate::commands::list::bitmap;
use bit_object_import::{
    parse_jsonc, read_scope_object, render_workspace_bitmap, reset_main::Plan, scope_path,
};
use serde_json::{Map, Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Check whether a non-glob component pattern is absent from a main-lane `.bitmap`.
pub(super) fn missing_component(root: &Path, pattern: &str) -> bool {
    if pattern.is_empty() || pattern.contains('@') {
        return false;
    }
    let Ok(bitmap) = bitmap::read(root) else {
        return false;
    };
    if bitmap.lane.is_some() {
        return false;
    }
    let dir = pattern.trim_start_matches("./");
    !bitmap.entries
        .iter()
        .any(|entry| {
            entry.root_dir == dir
                || entry.identity == pattern
                || entry.identity
                    .split_once('/')
                    .is_some_and(|(_, name)| name == pattern)
        })
}

/// Format the dependent blocker message when resetting a main-lane component without `--force`.
pub(super) fn dependent_error(root: &Path, identity: &str, head_only: bool) -> Option<String> {
    let plan = Plan::prepare(root, identity, head_only, true).ok()?;
    let scope = scope_path(root);
    let references = load_all_version_refs(&scope).ok()?;
    for label in &plan.selection.labels {
        let target = format!("{identity}@{label}");
        let dependents = immediate_dependents(&scope, &references, &target).ok()?;
        if !dependents.is_empty() {
            return Some(format!(
                "unable to reset {identity}, the version {label} has the following dependent(s) {}",
                dependents.join(", "),
            ));
        }
    }
    None
}

/// Collect `(version_hash, "scope/name@version")` across all indexed components.
fn load_all_version_refs(scope: &Path) -> io::Result<Vec<(String, String)>> {
    let index: Value = serde_json::from_slice(&fs::read(scope.join("index.json"))?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("reset index"))?;
    let mut refs = Vec::new();
    for row in rows {
        let hash = row["hash"].as_str().ok_or_else(|| invalid("reset model hash"))?;
        if let Some((_, model)) = read_scope_object(scope, hash)? {
            append_model_version_refs(&model, &mut refs)?;
        }
    }
    Ok(refs)
}

/// Append `(version_hash, "scope/name@version")` entries for one `Component` model.
fn append_model_version_refs(model: &Value, refs: &mut Vec<(String, String)>) -> io::Result<()> {
    let comp_scope = model["scope"].as_str().ok_or_else(|| invalid("reset scope"))?;
    let comp_name = model["name"].as_str().ok_or_else(|| invalid("reset name"))?;
    let identity = format!("{comp_scope}/{comp_name}");
    for field in ["versions", "orphanedVersions"] {
        if let Some(versions) = model[field].as_object() {
            append_version_map(&identity, versions, refs)?;
        }
    }
    Ok(())
}

/// Append version entries from a single version map (`versions` or `orphanedVersions`).
fn append_version_map(
    identity: &str,
    versions: &Map<String, Value>,
    refs: &mut Vec<(String, String)>,
) -> io::Result<()> {
    for (label, ver_hash) in versions {
        let ver_hash = ver_hash.as_str().ok_or_else(|| invalid("reset version hash"))?;
        refs.push((ver_hash.to_owned(), format!("{identity}@{label}")));
    }
    Ok(())
}

/// Find versioned component IDs whose `flattenedDependencies` include `target`.
fn immediate_dependents(
    scope: &Path,
    references: &[(String, String)],
    target: &str,
) -> io::Result<Vec<String>> {
    let mut found = Vec::new();
    for (reference, id) in references {
        let Some((_, version)) = read_scope_object(scope, reference)? else {
            continue;
        };
        if version_depends_on(&version, target) && !found.contains(id) {
            found.push(id.clone());
        }
    }
    Ok(found)
}

/// Check whether `version["flattenedDependencies"]` references `target`.
fn version_depends_on(version: &Value, target: &str) -> bool {
    version["flattenedDependencies"]
        .as_array()
        .is_some_and(|rows| rows.iter().any(|row| row_matches_target(row, target)))
}

/// Check whether a dependency entry matches `"<scope>/<name>@<version>"`.
fn row_matches_target(row: &Value, target: &str) -> bool {
    let (Some(dep_scope), Some(dep_name), Some(dep_ver)) =
        (row["scope"].as_str(), row["name"].as_str(), row["version"].as_str())
    else {
        return false;
    };
    format!("{dep_scope}/{dep_name}@{dep_ver}") == target
}

/// Prepared reset batch for main-lane components whose local snaps are detached heads.
pub(super) struct DetachedBatch {
    root: PathBuf,
    items: Vec<DetachedItem>,
    bitmap_after: Vec<u8>,
}

struct DetachedItem {
    identity: String,
    labels: Vec<String>,
    model_hash: String,
    model_after: Vec<u8>,
    history: Option<(String, Vec<u8>)>,
    bitmap_version: String,
}

impl DetachedBatch {
    /// Prepare a batch reset of main-lane components with detached heads.
    pub(super) fn prepare(root: &Path) -> io::Result<Self> {
        let scope = scope_path(root);
        let index: Value = serde_json::from_slice(&fs::read(scope.join("index.json"))?)?;
        let rows = index["components"]
            .as_array()
            .or_else(|| index.as_array())
            .ok_or_else(|| invalid("detached index"))?;
        let mut items = Vec::new();
        for row in rows {
            if let Some(item) = prepare_item(&scope, row)? {
                items.push(item);
            }
        }
        if items.is_empty() {
            return Err(invalid("no detached components to reset"));
        }
        let bitmap_after = project_bitmap(root, &items)?;
        Ok(Self { root: root.to_owned(), items, bitmap_after })
    }

    /// Yield `(identity, labels)` for the reset report.
    pub(super) fn results(&self) -> impl Iterator<Item = (&str, &[String])> {
        self.items
            .iter()
            .map(|item| (item.identity.as_str(), item.labels.as_slice()))
    }

    /// Persist the updated Component, `VersionHistory`, and `.bitmap` files.
    pub(super) fn commit(&self, file_id: &str) -> io::Result<()> {
        let scope = scope_path(&self.root);
        for item in &self.items {
            write_object(&scope, &item.model_hash, &item.model_after)?;
            if let Some((hash, bytes)) = &item.history {
                write_object(&scope, hash, bytes)?;
            }
        }
        backup_bitmap(&self.root, file_id)?;
        fs::write(self.root.join(".bitmap"), &self.bitmap_after)
    }
}

/// Prepare one component if it has local versions on a detached head.
fn prepare_item(scope: &Path, row: &Value) -> io::Result<Option<DetachedItem>> {
    let model_hash = row["hash"].as_str().ok_or_else(|| invalid("detached hash"))?;
    let (_, mut model) =
        read_scope_object(scope, model_hash)?.ok_or_else(|| invalid("detached model absent"))?;
    let local = local_versions(&model);
    if local.is_empty() {
        return Ok(None);
    }
    let current = detached_current_snap(&model, &local)?;
    let (parents, bitmap_version) = detached_parent_info(scope, &model, &current)?;
    let comp_scope = model["scope"]
        .as_str()
        .ok_or_else(|| invalid("detached scope"))?
        .to_owned();
    let comp_name = model["name"]
        .as_str()
        .ok_or_else(|| invalid("detached name"))?
        .to_owned();
    update_detached_model(&mut model, &current)?;
    let model_after = encode_object("Component", model_hash, &model)?;
    let history = prepare_history(scope, &comp_scope, &comp_name, &current, &parents)?;
    Ok(Some(DetachedItem {
        identity: format!("{comp_scope}/{comp_name}"),
        labels: vec![current],
        model_hash: model_hash.to_owned(),
        model_after,
        history,
        bitmap_version,
    }))
}

/// Validate that the component's only local snap is its detached current head.
fn detached_current_snap(model: &Value, local: &[String]) -> io::Result<String> {
    let head = model["head"].as_str().ok_or_else(|| invalid("detached main head"))?;
    let current = model["detachedHeads"]["current"]
        .as_str()
        .ok_or_else(|| invalid("detached current head"))?
        .to_owned();
    if local != [current.clone()] || head == current {
        return Err(invalid("unsupported detached history"));
    }
    Ok(current)
}

/// Load the detached `Version` object and resolve its parent list and `.bitmap` version label.
fn detached_parent_info(scope: &Path, model: &Value, current: &str) -> io::Result<(Value, String)> {
    let (_, version) =
        read_scope_object(scope, current)?.ok_or_else(|| invalid("detached version absent"))?;
    let parents = version["parents"].as_array().ok_or_else(|| invalid("detached parents"))?;
    let [parent] = parents.as_slice() else {
        return Err(invalid("detached parent count"));
    };
    let parent_hash = parent.as_str().ok_or_else(|| invalid("detached parent hash"))?;
    let label = tag_for_hash(model, parent_hash).unwrap_or_else(|| parent_hash.to_owned());
    Ok((version["parents"].clone(), label))
}

/// Extract keys marked `local: true` in `state.versions`.
fn local_versions(model: &Value) -> Vec<String> {
    model["state"]["versions"]
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(_, entry)| entry["local"] == true)
        .map(|(label, _)| label.clone())
        .collect()
}

/// Find the tag name for a version hash if one exists in `model["versions"]`.
fn tag_for_hash(model: &Value, target_hash: &str) -> Option<String> {
    model["versions"]
        .as_object()?
        .iter()
        .find_map(|(tag, hash)| (hash.as_str() == Some(target_hash)).then(|| tag.clone()))
}

/// Remove the detached version from `versions`, `state.versions`, and `detachedHeads`.
fn update_detached_model(model: &mut Value, removed: &str) -> io::Result<()> {
    if let Some(versions) = model["versions"].as_object_mut() {
        versions.shift_remove(removed);
    }
    if let Some(state_versions) = model["state"]["versions"].as_object_mut() {
        state_versions.shift_remove(removed);
    }
    let fields = model.as_object_mut().ok_or_else(|| invalid("detached model object"))?;
    if let Some(detached) = fields.get_mut("detachedHeads").and_then(Value::as_object_mut) {
        prune_detached_heads(detached, removed);
        if Map::is_empty(detached) {
            fields.shift_remove("detachedHeads");
        }
    }
    Ok(())
}

/// Prune `heads`, `current`, and empty `deleted` from `detachedHeads`.
fn prune_detached_heads(detached: &mut Map<String, Value>, removed: &str) {
    prune_head_list(detached, removed);
    if detached.get("current").and_then(Value::as_str) == Some(removed) {
        detached.shift_remove("current");
    }
    if detached
        .get("deleted")
        .and_then(Value::as_array)
        .is_some_and(Vec::is_empty)
    {
        detached.shift_remove("deleted");
    }
}

/// Remove `removed` from `detachedHeads.heads` and drop the array if empty.
fn prune_head_list(detached: &mut Map<String, Value>, removed: &str) {
    let Some(heads) = detached.get_mut("heads").and_then(Value::as_array_mut) else {
        return;
    };
    heads.retain(|hash| hash.as_str() != Some(removed));
    if heads.is_empty() {
        detached.shift_remove("heads");
    }
}

/// Append the removed detached snap to `VersionHistory` if not already recorded.
fn prepare_history(
    scope: &Path,
    comp_scope: &str,
    comp_name: &str,
    removed: &str,
    parents: &Value,
) -> io::Result<Option<(String, Vec<u8>)>> {
    let key = format!("{comp_scope}/{comp_name}:VersionHistory");
    let hash = format!("{:x}", Sha1::digest(key.as_bytes()));
    let mut history = match read_scope_object(scope, &hash)? {
        Some((_, existing)) => existing,
        None => json!({
            "name": comp_name,
            "scope": comp_scope,
            "versions": [],
            "graphCompleteRefs": [],
        }),
    };
    let versions =
        history["versions"].as_array_mut().ok_or_else(|| invalid("detached history versions"))?;
    if versions
        .iter()
        .any(|entry| entry["hash"] == removed)
    {
        return Ok(None);
    }
    versions.push(json!({"hash": removed, "parents": parents}));
    let bytes = encode_object("VersionHistory", &hash, &history)?;
    Ok(Some((hash, bytes)))
}

/// Project `.bitmap` with the pre-detachment version for each reset component.
fn project_bitmap(root: &Path, items: &[DetachedItem]) -> io::Result<Vec<u8>> {
    let bytes = fs::read(root.join(".bitmap"))?;
    let mut document = parse_jsonc(&bytes)?;
    let fields = document.as_object_mut().ok_or_else(|| invalid("detached bitmap object"))?;
    for item in items {
        let (scope, name) =
            item.identity.split_once('/').ok_or_else(|| invalid("detached item identity"))?;
        let key = find_bitmap_key(fields, scope, name)?;
        let row = fields[&key].as_object_mut().ok_or_else(|| invalid("detached bitmap row"))?;
        row.insert("version".into(), Value::String(item.bitmap_version.clone()));
        row.shift_remove("nextVersion");
    }
    render_workspace_bitmap(&document)
}

/// Locate the `.bitmap` key for `scope/name`.
fn find_bitmap_key(fields: &Map<String, Value>, scope: &str, name: &str) -> io::Result<String> {
    fields
        .iter()
        .find_map(|(key, row)| {
            if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
                return None;
            }
            let (row_scope, row_name) =
                crate::commands::update_cmd::bitmap_row_scope_and_name(key, row);
            (row_scope == scope && row_name == name).then(|| key.clone())
        })
        .ok_or_else(|| invalid("detached bitmap key absent"))
}

/// Encode a Bit scope object into a valid RFC 1950 zlib stream using stored deflate blocks.
fn encode_object(kind: &str, hash: &str, value: &Value) -> io::Result<Vec<u8>> {
    let body = serde_json::to_string(value).map_err(io::Error::other)?;
    let raw = format!("{kind} {hash} {}\0{body}", body.encode_utf16().count()).into_bytes();
    let mut out = vec![0x78, 0x01];
    let chunks: Vec<&[u8]> = if raw.is_empty() { vec![&[]] } else { raw.chunks(65535).collect() };
    for (index, chunk) in chunks.iter().enumerate() {
        let last = u8::from(index + 1 == chunks.len());
        let len = u16::try_from(chunk.len()).unwrap_or(0);
        out.push(last);
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(&(!len).to_le_bytes());
        out.extend_from_slice(chunk);
    }
    out.extend_from_slice(&adler32(&raw).to_be_bytes());
    Ok(out)
}

/// Compute the RFC 1950 Adler-32 checksum of `bytes`.
fn adler32(bytes: &[u8]) -> u32 {
    let mut sum_low: u32 = 1;
    let mut sum_high: u32 = 0;
    for &byte in bytes {
        sum_low = (sum_low + u32::from(byte)) % 65521;
        sum_high = (sum_high + sum_low) % 65521;
    }
    (sum_high << 16) | sum_low
}

/// Write compressed object bytes to `<scope>/objects/<2>/<38>`.
fn write_object(scope: &Path, hash: &str, bytes: &[u8]) -> io::Result<()> {
    let path = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, bytes)
}

/// Record `.bitmap` backup and metadata receipt for `reset`.
fn backup_bitmap(root: &Path, file_id: &str) -> io::Result<()> {
    let directory = root.join(".bit/bitmap-history");
    fs::create_dir_all(&directory)?;
    fs::copy(root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join(".bit/bitmap-history-metadata.txt"))?;
    writeln!(metadata, "{file_id} reset")
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
