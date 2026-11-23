//! Native, validated file history ([`Target`], [`read`]) shared by [`LOG_FILE`] (`log-file`) and [`BLAME`] (`blame`).

mod blame;
mod log_file;
/// Descriptor for the `bit blame` CLI command ([`Target`], [`read`]).
pub(super) const BLAME: super::Command = blame::COMMAND;
/// Descriptor for the `bit log-file` CLI command.
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

/// Ownership classification of a workspace file path for `bit blame` ([`BLAME`]) and `bit log-file` ([`LOG_FILE`]).
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Target {
    Versioned { identity: String, file: String, lane: Option<Value> },
    Unversioned,
    Unowned,
}

/// Reads, orders, and normalizes the version history of a workspace file `input` via [`classify_target`] and [`Engine`].
#[inline]
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

/// Resolves `input` against `.bitmap` and classifies it as [`Target::Versioned`], [`Target::Unversioned`], or [`Target::Unowned`].
pub(super) fn classify_target(root: &Path, input: &str) -> io::Result<Target> {
    if root.join("workspace.jsonc").is_file() {
        super::status::autosync::run_if_enabled(root)?;
    }
    let input = input.trim();
    let normalized = if cfg!(windows) && input.contains('\\') {
        std::borrow::Cow::Owned(input.replace('\\', "/"))
    } else {
        std::borrow::Cow::Borrowed(input)
    };
    let requested = normalized.trim_start_matches("./");
    if !is_valid_relative_file_path(requested) {
        return Err(decline("file history path"));
    }
    let bitmap = bitmap::read(root)?;
    let Some((entry, relative, _)) = bitmap.entries
        .iter()
        .filter_map(|entry| match_entry_file(entry, requested))
        .max_by_key(|(_, _, dir_len)| *dir_len)
    else {
        return Ok(Target::Unowned);
    };
    if entry.version
        .as_deref()
        .map(str::trim)
        .is_none_or(str::is_empty)
    {
        return Ok(Target::Unversioned);
    }
    Ok(Target::Versioned {
        identity: entry.identity.trim().to_string(),
        file: relative.to_string(),
        lane: bitmap.lane,
    })
}

/// Matches `requested` against `entry.root_dir` and returns `(entry, relative_path, dir_len)` for [`classify_target`].
#[inline]
fn match_entry_file<'a>(
    entry: &'a bitmap::Entry,
    requested: &'a str,
) -> Option<(&'a bitmap::Entry, &'a str, usize)> {
    let dir = entry.root_dir
        .trim()
        .trim_start_matches("./")
        .trim_end_matches('/');
    if dir.is_empty() {
        return None;
    }
    requested
        .strip_prefix(dir)
        .and_then(|relative| relative.strip_prefix('/'))
        .filter(|relative| !relative.is_empty())
        .map(|relative| (entry, relative, dir.len()))
}

#[inline]
fn is_valid_relative_file_path(requested: &str) -> bool {
    !requested.is_empty()
        && !requested.contains('\\')
        && Path::new(requested)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}
