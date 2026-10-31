#[cfg(test)]
mod tests;

use super::{BodyInput, invalid};
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};

pub(super) fn files(
    input: &BodyInput<'_>,
    plan: &Value,
    files: Vec<Value>,
    removals: &[PathBuf],
) -> io::Result<Vec<Value>> {
    if input.current.hidden {
        return Ok(files);
    }
    retain(&input.root.join(&input.current.target.directory), plan, files, removals)
}

// A writer does not remove a file merely because it is absent from its output.
// The subsequent workspace reload also sees surviving locally modified files.
fn retain(
    directory: &Path,
    plan: &Value,
    mut files: Vec<Value>,
    removals: &[PathBuf],
) -> io::Result<Vec<Value>> {
    for current in
        plan["currentFiles"].as_array().ok_or_else(|| invalid("merge reload current files"))?
    {
        let path = current["relativePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("merge reload current path"))?;
        crate::checkout::plan::relative_path(path)?;
        if files
            .iter()
            .any(|file| file["relativePath"].as_str().map(str::trim) == Some(path))
            || removals.contains(&directory.join(path))
        {
            continue;
        }
        files.push(json!({"relativePath":path,"planIndex":current["planIndex"],"source":current}));
    }
    Ok(files)
}
