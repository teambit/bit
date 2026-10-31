//! Native, validated file history shared by `log-file` and `blame`.

mod blame;
mod log_file;
pub(super) const BLAME: super::Command = blame::COMMAND;
pub(super) const LOG_FILE: super::Command = log_file::COMMAND;

use super::{
    engine::Engine,
    list::bitmap,
    log,
    status::js::{array, decline},
};
use serde_json::{Value, json};
use std::{
    io,
    path::{Component, Path},
};

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Target {
    Versioned { identity: String, file: String, lane: Option<Value> },
    Unversioned,
    Unowned,
}

pub(super) fn read(root: &Path, input: &str) -> io::Result<(String, String, Vec<Value>)> {
    let Target::Versioned { identity, file, lane } = classify_target(root, input)? else {
        return Err(decline("file history component absent"));
    };
    let mut engine = Engine::new()?;
    let result: Value = engine.request(&json!({
        "kind":"componentFileHistory","root":root,
        "identity":identity,"file":file,"lane":lane,
    }))?;
    let mut rows = array(result.get("history"), "file history rows")?.to_vec();
    for (order, row) in rows.iter_mut().enumerate() {
        row["headOrder"] = json!(order);
    }
    rows.sort_by(|left, right| log::raw_date_order(&left["log"], &right["log"]));
    for row in &mut rows {
        row["normalized"] = log::normalize(&row["log"])?;
    }
    Ok((identity, file, rows))
}

pub(super) fn classify_target(root: &Path, input: &str) -> io::Result<Target> {
    if root.join("workspace.jsonc").is_file() {
        super::status::autosync::run_if_enabled(root)?;
    }
    let input = input.trim();
    let normalized = if cfg!(windows) { input.replace('\\', "/") } else { input.to_string() };
    let requested = normalized.strip_prefix("./").unwrap_or(&normalized);
    if !is_valid_relative_file_path(requested) {
        return Err(decline("file history path"));
    }
    let bitmap = bitmap::read(root)?;
    let Some((entry, relative)) = bitmap.entries
        .iter()
        .filter_map(|entry| {
            let dir = entry.root_dir.trim_start_matches("./").trim_end_matches('/');
            requested
                .strip_prefix(dir)
                .and_then(|relative| relative.strip_prefix('/'))
                .filter(|relative| !relative.is_empty())
                .map(|relative| (entry, relative))
        })
        .max_by_key(|(entry, _)| entry.root_dir.len())
    else {
        return Ok(Target::Unowned);
    };
    if entry.version.is_none() {
        return Ok(Target::Unversioned);
    }
    Ok(Target::Versioned {
        identity: entry.identity.clone(),
        file: relative.to_string(),
        lane: bitmap.lane,
    })
}

fn is_valid_relative_file_path(requested: &str) -> bool {
    !requested.is_empty()
        && !requested.contains('\\')
        && Path::new(requested)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}
