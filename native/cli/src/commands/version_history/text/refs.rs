//! Qualify tracked remote lane labels without relying on filesystem iteration order.
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) fn lanes(root: &Path, scope: &str, component: &str) -> Option<Vec<(String, String)>> {
    let mut lanes = Vec::new();
    for (name, path) in lane_paths(root)? {
        if let Some(head) = lane_head(&path, scope, component)? {
            lanes.push((name, head));
        }
    }
    qualify_shared_heads(&lanes)?;
    lanes.sort_by(|left, right| right.0.cmp(&left.0));
    Some(lanes)
}

fn qualify_shared_heads(lanes: &[(String, String)]) -> Option<()> {
    let mut remotes = std::collections::HashMap::new();
    for (name, head) in lanes {
        let remote = name.split_once('/')?.0;
        if remotes
            .insert(head, remote)
            .is_some_and(|previous| previous != remote)
        {
            return None;
        }
    }
    Some(())
}

fn lane_head(path: &Path, scope: &str, component: &str) -> Option<Option<String>> {
    let rows: Value = bit_object_import::parse_jsonc(&fs::read(path).ok()?).ok()?;
    let row = rows
        .as_array()?
        .iter()
        .find(|row| {
            crate::commands::version_history::build::row_scope_and_name(row)
                == Some((scope.trim(), component.trim()))
        });
    match row {
        Some(row) => Some(Some(
            row["head"]
                .as_str()
                .map(str::trim)
                .filter(|head| !head.is_empty())?
                .to_owned(),
        )),
        None => Some(None),
    }
}

fn lane_paths(root: &Path) -> Option<Vec<(String, PathBuf)>> {
    let mut paths = Vec::new();
    for remote in entries(&root.join("refs/remotes"))? {
        let remote_name = remote.file_name().into_string().ok()?;
        if remote_name.starts_with('.') {
            continue;
        }
        if !remote.file_type().ok()?.is_dir() {
            return None;
        }
        paths.extend(remote_lanes(&remote.path(), &remote_name)?);
    }
    Some(paths)
}

fn remote_lanes(root: &Path, remote: &str) -> Option<Vec<(String, PathBuf)>> {
    let mut paths = Vec::new();
    for lane in entries(root)? {
        let name = lane.file_name().into_string().ok()?;
        if name.starts_with('.') || matches!(name.as_str(), "main" | "master") {
            continue;
        }
        if !lane.file_type().ok()?.is_file() {
            return None;
        }
        paths.push((format!("{remote}/{name}"), lane.path()));
    }
    Some(paths)
}

fn entries(path: &Path) -> Option<Vec<fs::DirEntry>> {
    match fs::read_dir(path) {
        Ok(entries) => entries.collect::<Result<Vec<_>, _>>().ok(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Some(Vec::new()),
        Err(_) => None,
    }
}
