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
            if lanes
                .iter()
                .any(|(_, other)| other == &head)
            {
                return None;
            }
            lanes.push((name, head));
        }
    }
    Some(lanes)
}

fn lane_head(path: &Path, scope: &str, component: &str) -> Option<Option<String>> {
    let rows: Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    let row = rows
        .as_array()?
        .iter()
        .find(|row| {
            row["id"]["scope"].as_str() == Some(scope)
                && row["id"]["name"].as_str() == Some(component)
        });
    match row {
        Some(row) => Some(Some(row["head"].as_str()?.to_owned())),
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
