//! Qualify tracked remote lane labels without relying on filesystem iteration order.
//!
//! [`lanes`] and [`qualify_shared_heads`] collect deterministic lane head references for a component from [`Path`] objects.
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Collects sorted `(lane_name, head_hash)` pairs for `scope`/`component` from tracked remote lanes in `root`.
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

/// Verifies that no two remotes share the same lane head hash in `lanes`.
#[inline]
fn qualify_shared_heads(lanes: &[(String, String)]) -> Option<()> {
    let mut remotes = std::collections::HashMap::with_capacity(lanes.len());
    for (name, head) in lanes {
        let remote = name.split_once('/')?.0.trim();
        let head = head.trim();
        if remote.is_empty()
            || head.is_empty()
            || remotes
                .insert(head, remote)
                .is_some_and(|previous| previous != remote)
        {
            return None;
        }
    }
    Some(())
}

/// Reads remote lane ref file `path` and extracts the 40-hex-character head hash for `scope`/`component`.
#[inline]
fn lane_head(path: &Path, scope: &str, component: &str) -> Option<Option<String>> {
    let rows: Value = bit_object_import::parse_jsonc(&fs::read(path).ok()?).ok()?;
    let target = (scope.trim(), component.trim());
    let Some(row) = rows
        .as_array()?
        .iter()
        .find(|row| {
            crate::commands::version_history::build::row_scope_and_name(row) == Some(target)
        })
    else {
        return Some(None);
    };
    let head = row["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| head.len() == 40 && head.bytes().all(|byte| byte.is_ascii_hexdigit()))?;
    Some(Some(head.to_owned()))
}

/// Enumerates tracked remote lane ref files under `root/refs/remotes`.
fn lane_paths(root: &Path) -> Option<Vec<(String, PathBuf)>> {
    let mut paths = Vec::new();
    for remote in entries(&root.join("refs/remotes"))? {
        let remote_name = remote.file_name().into_string().ok()?;
        let remote_name = remote_name.trim();
        if remote_name.is_empty() || remote_name.starts_with('.') {
            continue;
        }
        if !remote.file_type().ok()?.is_dir() {
            return None;
        }
        remote_lanes(&remote.path(), remote_name, &mut paths)?;
    }
    Some(paths)
}

fn remote_lanes(root: &Path, remote: &str, paths: &mut Vec<(String, PathBuf)>) -> Option<()> {
    for lane in entries(root)? {
        let name = lane.file_name().into_string().ok()?;
        let name = name.trim();
        if name.is_empty() || name.starts_with('.') || matches!(name, "main" | "master") {
            continue;
        }
        if !lane.file_type().ok()?.is_file() {
            return None;
        }
        paths.push((format!("{remote}/{name}"), lane.path()));
    }
    Some(())
}

#[inline]
fn entries(path: &Path) -> Option<Vec<fs::DirEntry>> {
    match fs::read_dir(path) {
        Ok(entries) => {
            let collected = entries
                .take(1025)
                .collect::<Result<Vec<_>, _>>()
                .ok()?;
            (collected.len() <= 1024).then_some(collected)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Some(Vec::new()),
        Err(_) => None,
    }
}
