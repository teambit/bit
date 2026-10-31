//! Move unexported main snaps into a newly created lane before publishing workspace references.
mod history;

use super::{Documents, invalid, outbound};
use crate::store::Store;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub(super) struct Moved {
    pub components: Vec<Value>,
    objects: Vec<(String, &'static str, Value)>,
    reads: Vec<(PathBuf, Option<Vec<u8>>)>,
}

impl Moved {
    fn read(&mut self, path: &Path) -> io::Result<Option<Vec<u8>>> {
        let bytes = match fs::read(path) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        let total = self.reads
            .iter()
            .filter_map(|(_, bytes)| bytes.as_ref())
            .map(Vec::len)
            .fold(0_usize, usize::saturating_add);
        if total.saturating_add(bytes.as_ref().map_or(0, Vec::len)) > 32 * 1024 * 1024 {
            return Err(invalid());
        }
        self.reads.push((path.to_owned(), bytes.clone()));
        Ok(bytes)
    }

    fn object(&mut self, directory: &Path, hash: &str, kind: &str) -> io::Result<Value> {
        crate::merge_history::hash(hash)?;
        self.read(
            &directory
                .join(&hash[..2])
                .join(&hash[2..]),
        )?
        .ok_or_else(invalid)?;
        outbound::read_object(directory, hash, kind)
    }

    pub(super) fn validate(&self) -> io::Result<()> {
        for (path, before) in &self.reads {
            let after = match fs::read(path) {
                Ok(bytes) => Some(bytes),
                Err(error) if error.kind() == io::ErrorKind::NotFound => None,
                Err(error) => return Err(error),
            };
            if &after != before {
                return Err(invalid());
            }
        }
        Ok(())
    }

    pub(super) fn persist(&self, store: &Store) -> io::Result<()> {
        for (hash, kind, object) in &self.objects {
            store.write(hash, &outbound::encode_object(hash, kind, object)?)?;
        }
        store.finish_batch()
    }
}

pub(super) fn prepare(
    root: &Path,
    documents: &Documents,
    name: &str,
    scope: &str,
    lane_hash: &str,
) -> io::Result<Moved> {
    let mut moved = Moved::default();
    let scope_path = crate::scope_path(root);
    let directory = scope_path.join("objects");
    for path in [root.join(".bitmap"), scope_path.join("index.json"), scope_path.join("scope.json")]
    {
        moved.read(&path)?;
    }
    let lane = json!({"scope":scope,"name":name,"hash":lane_hash});
    for row in documents.index["components"]
        .as_array()
        .or_else(|| documents.index.as_array())
        .ok_or_else(invalid)?
    {
        if row["isSymlink"] == true {
            continue;
        }
        let hash = row["hash"].as_str().ok_or_else(invalid)?;
        let model = moved.object(&directory, hash, "Component")?;
        if let Some(version) = workspace_version(&documents.bitmap, &model) {
            component(&mut moved, &scope_path, hash, &model, &version, &lane)?;
        }
    }
    moved.validate()?;
    Ok(moved)
}

fn workspace_version(bitmap: &Value, model: &Value) -> Option<String> {
    let name = model["name"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())?;
    let scope = model["scope"].as_str().map_or("", str::trim);
    let full = format!("{scope}/{name}");
    let (key, row) = bitmap
        .as_object()?
        .iter()
        .find(|(key, row)| bitmap_row_matches(key, row, scope, name, &full))?;
    Some(
        row["version"]
            .as_str()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
            .or_else(|| key.rsplit_once('@').map(|(_, ver)| ver.trim()))
            .unwrap_or_default()
            .to_owned(),
    )
}

fn bitmap_row_matches(key: &str, row: &Value, scope: &str, name: &str, _full: &str) -> bool {
    if key.starts_with('$')
        || matches!(key, "version" | "_bit_lane")
        || !row.is_object()
        || row["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
    {
        return false;
    }
    let (tracked_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
    row_name == name && (scope.is_empty() || tracked_scope == Some(scope))
}

fn remote(moved: &mut Moved, scope_path: &Path, model: &Value) -> io::Result<Option<String>> {
    let scope = model["scope"].as_str().ok_or_else(invalid)?;
    let name = model["name"].as_str().ok_or_else(invalid)?;
    if !super::valid_scope(scope) {
        return Err(invalid());
    }
    let bytes = match moved.read(
        &scope_path
            .join("refs/remote")
            .join(scope)
            .join("main"),
    )? {
        Some(bytes) => Some(bytes),
        None => moved.read(
            &scope_path
                .join("refs/remotes")
                .join(scope)
                .join("main"),
        )?,
    };
    let Some(bytes) = bytes else {
        return Ok(None);
    };
    let parsed = crate::parse_jsonc(&bytes)?;
    let rows = parsed.as_array().ok_or_else(invalid)?;
    let full = format!("{scope}/{name}");
    rows.iter()
        .find(|row| {
            let row_scope = row["id"]["scope"].as_str().unwrap_or_default();
            (row["id"]["name"] == name && (row_scope.is_empty() || row_scope == scope))
                || row["id"].as_str() == Some(full.as_str())
                || row["id"].as_str() == Some(name)
        })
        .map(|row| {
            row["head"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(invalid)
        })
        .transpose()
}

fn resolve_workspace_hash<'a>(model: &'a Value, workspace: &'a str, head: &'a str) -> &'a str {
    if workspace.is_empty() || matches!(workspace, "latest" | "head") {
        head
    } else {
        model["versions"][workspace]
            .as_str()
            .or_else(|| model["orphanedVersions"][workspace].as_str())
            .unwrap_or(workspace)
    }
}

fn component(
    moved: &mut Moved,
    scope_path: &Path,
    hash: &str,
    model: &Value,
    workspace: &str,
    lane: &Value,
) -> io::Result<()> {
    let Some(head) = model["head"].as_str() else { return Ok(()) };
    let remote = remote(moved, scope_path, model)?;
    let workspace_hash = resolve_workspace_hash(model, workspace, head);
    let source = if remote.as_deref() == Some(head) { workspace_hash } else { head };
    let directory = scope_path.join("objects");
    let heads = [Some(source), remote.as_deref()]
        .into_iter()
        .flatten()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let graph = crate::merge_history::read_graph(&directory, &heads)?;
    let distance = crate::merge_history::status::distance(&graph, Some(source), remote.as_deref())?;
    let refs = distance["sourceOnly"].as_array().ok_or_else(invalid)?;
    if refs.is_empty() {
        return Ok(());
    }
    if source != head || workspace_hash != head || has_tags(model, refs) {
        return Err(invalid());
    }
    for row in graph.as_array().ok_or_else(invalid)? {
        moved.object(&directory, row["hash"].as_str().ok_or_else(invalid)?, "Version")?;
    }
    if crate::merge_history::read_graph(&directory, &heads)? != graph {
        return Err(invalid());
    }
    history::prepare(moved, &directory, model, &heads)?;
    move_objects(moved, &directory, hash, model.clone(), refs, remote.as_deref(), lane)?;
    moved.components.push(json!({"id":{"scope":model["scope"],"name":model["name"]},"head":head}));
    Ok(())
}

#[cfg(test)]
mod tests;

fn has_tags(model: &Value, refs: &[Value]) -> bool {
    model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(serde_json::Map::values)
        .any(|hash| refs.contains(hash))
}

fn move_objects(
    moved: &mut Moved,
    directory: &Path,
    hash: &str,
    mut model: Value,
    refs: &[Value],
    remote: Option<&str>,
    lane: &Value,
) -> io::Result<()> {
    for reference in refs.iter().rev() {
        let reference = reference.as_str().ok_or_else(invalid)?;
        let mut version = moved.object(directory, reference, "Version")?;
        if version["origin"]["lane"].is_null() {
            let id = version["origin"]
                .get("id")
                .cloned()
                .unwrap_or_else(|| json!({"scope":model["scope"],"name":model["name"]}));
            version["origin"] = json!({"id":id,"lane":lane});
            moved.objects.push((reference.to_owned(), "Version", version));
        }
        if let Some(versions) = model["state"]["versions"].as_object_mut() {
            versions.shift_remove(reference);
        }
    }
    let fields = model.as_object_mut().ok_or_else(invalid)?;
    if let Some(remote) = remote {
        fields.insert("head".into(), json!(remote));
    } else {
        fields.shift_remove("head");
    }
    moved.objects.push((hash.to_owned(), "Component", model));
    Ok(())
}
