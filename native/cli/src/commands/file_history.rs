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

pub(super) fn read(root: &Path, input: &str) -> io::Result<(String, String, Vec<Value>)> {
    let (identity, file, lane) = target(root, input)?;
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

fn target(root: &Path, input: &str) -> io::Result<(String, String, Option<Value>)> {
    let normalized = if cfg!(windows) { input.replace('\\', "/") } else { input.to_string() };
    let requested = normalized.strip_prefix("./").unwrap_or(&normalized);
    let path = Path::new(requested);
    if requested.is_empty()
        || requested.contains('\\')
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(decline("file history path"));
    }
    let bitmap = bitmap::read(root)?;
    let target = bitmap.entries
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
        .ok_or_else(|| decline("file history component absent"))?;
    Ok((target.0.identity.clone(), target.1.to_string(), bitmap.lane))
}
