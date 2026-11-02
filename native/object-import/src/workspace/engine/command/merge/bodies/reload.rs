//! Retain unmodified current workspace [`files`] from [`BodyInput`] alongside merged output files.

#[cfg(test)]
mod tests;

use super::{BodyInput, invalid};
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};

/// Retains surviving unmodified workspace files alongside merged output `files` when `input.current` is not hidden.
#[inline]
pub(super) fn files(
    input: &BodyInput<'_>,
    plan: &Value,
    files: Vec<Value>,
    removals: &[PathBuf],
) -> io::Result<Vec<Value>> {
    if input.current.hidden {
        return Ok(files);
    }
    retain(&input.root.join(input.current.target.directory.trim()), plan, files, removals)
}

/// Appends unmodified `currentFiles` from `plan` that were neither overwritten nor scheduled in `removals`.
fn retain(
    directory: &Path,
    plan: &Value,
    mut files: Vec<Value>,
    removals: &[PathBuf],
) -> io::Result<Vec<Value>> {
    for current in plan["currentFiles"]
        .as_array()
        .filter(|rows| rows.len() <= 16384)
        .ok_or_else(|| invalid("merge reload current files"))?
    {
        let path = current["relativePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("merge reload current path"))?;
        crate::checkout::plan::relative_path(path)?;
        if path == ".bitmap" {
            return Err(invalid("merge reload nested bitmap"));
        }
        if files
            .iter()
            .any(|file| file["relativePath"].as_str().map(str::trim) == Some(path))
            || (!removals.is_empty() && removals.contains(&directory.join(path)))
        {
            continue;
        }
        files.push(json!({"relativePath":path,"planIndex":current["planIndex"],"source":current}));
    }
    Ok(files)
}
