//! Snapshot consumers follow the published loader's breadth-first source traversal.
use super::{Capture, array, decline, text};
use serde_json::json;
use std::{io, path::Path};

pub(super) fn snapshot(root: &Path, capture: &mut Capture) -> io::Result<()> {
    for target in capture.captured.iter_mut().chain(&mut capture.comparisons) {
        let files = array(target.get("files"), "snapshot source manifest")?
            .iter()
            .map(|file| text(Some(file)).map(str::to_owned))
            .collect::<io::Result<Vec<_>>>()?;
        let directory =
            target["directory"].as_str().ok_or_else(|| decline("snapshot directory"))?;
        target["files"] = json!(crate::commands::diff::order::captured(
            &root.join(directory),
            &files,
            target.get("sourceOverlays"),
        )?);
    }
    Ok(())
}
