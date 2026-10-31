//! Snapshot consumers follow the published loader's breadth-first source traversal.
use super::{Capture, array, decline, text};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn snapshot(root: &Path, capture: &mut Capture) -> io::Result<()> {
    for target in capture.captured.iter_mut().chain(&mut capture.comparisons) {
        let files = array(target.get("files"), "snapshot source manifest")?
            .iter()
            .map(snapshot_file_path)
            .collect::<io::Result<Vec<_>>>()?;
        let directory = target["directory"]
            .as_str()
            .or_else(|| target["rootDir"].as_str())
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| decline("snapshot directory"))?;
        target["files"] = json!(crate::commands::diff::order::captured(
            &root.join(directory),
            &files,
            target.get("sourceOverlays"),
        )?);
    }
    Ok(())
}

fn snapshot_file_path(file: &Value) -> io::Result<String> {
    let value = if file.is_string() {
        Some(file)
    } else {
        file.get("relativePath")
            .or_else(|| file.get("path"))
    };
    let path = text(value)?.trim().trim_start_matches("./");
    if path.is_empty() {
        return Err(decline("snapshot file path"));
    }
    Ok(path.to_owned())
}
