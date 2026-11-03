//! Cold-command in-memory workspace file modification check ([`modified`]) against model [`wire::Model`] hashes via [`read::capture`] and [`files::validated_models`] within [`MAX_FILES`] and [`MAX_BYTES`].

use super::{MAX_BYTES, MAX_FILES, files, invalid, read, wire};
use serde_json::Value;
use std::{io, path::Path};

/// Checks whether any workspace file at `paths` under `root` [`Path`] differs from `load_models` (up to [`MAX_FILES`] and [`MAX_BYTES`]).
/// A cold command owns these reads outright: no public model or Source aliases
/// exist yet, so only the comparison result needs to cross the runtime boundary.
#[inline]
pub(crate) fn modified(
    root: &Path,
    paths: &[String],
    workspace_root: bool,
    load_models: impl FnOnce() -> io::Result<Value>,
) -> io::Result<bool> {
    if !root.is_absolute() || paths.len() > MAX_FILES {
        return Err(invalid("status file count limit"));
    }
    let request = wire::Begin {
        files: paths
            .iter()
            .map(|relative_path| {
                let trimmed = relative_path.trim();
                wire::Input {
                    path: root.join(trimmed),
                    relative_path: trimmed.to_owned(),
                    raw_hash: None,
                    read_token: None,
                    snapshot_hash: None,
                }
            })
            .collect(),
        workspace_root,
        memory_only: false,
        owned_memory: true,
        snapshot_directory: root.into(),
    };
    let captured = read::capture(&request, MAX_BYTES, None)?;
    let models: Vec<wire::Model> =
        serde_json::from_value(load_models()?).map_err(io::Error::other)?;
    let models = files::validated_models(&models)?;
    Ok(!models.is_empty()
        && (captured.len() != models.len()
            || captured
                .iter()
                .any(|file| {
                    models
                        .get(&file.relative_path)
                        .is_none_or(|model| {
                            !model.normalized_hash().eq_ignore_ascii_case(file.linux_hash.trim())
                        })
                })))
}
