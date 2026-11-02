//! Package manifest serialization and command-owned atomic publication errors.
//!
//! Atomically writes formatted `package.json` [`Manifest`]s via temporary sibling files while rejecting symlink targets.

use super::{Manifest, is_symlink};
use std::{fs, io, path::Path};
/// Atomically write a component `package.json` [`Manifest`] at `path`, returning `true` if its content changed.
#[inline]
pub(super) fn package(path: &Path, manifest: &Manifest) -> io::Result<bool> {
    write(path, manifest, false)
}
/// Atomically write a component `package.json` [`Manifest`] at `path` using tracking temp-file naming.
#[inline]
pub(super) fn tracking(path: &Path, manifest: &Manifest) -> io::Result<bool> {
    write(path, manifest, true)
}
fn write(path: &Path, manifest: &Manifest, tracking: bool) -> io::Result<bool> {
    if is_symlink(path) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!(
                r#"fatal: trying to write a package.json file into a symlink file at "{}""#,
                path.display(),
            ),
        ));
    }
    let compact = serde_json::to_string(manifest).map_err(io::Error::other)?;
    let changed =
        fs::read_to_string(path).ok().and_then(|text| compact_json(&text)) != Some(compact);
    let mut text = serde_json::to_string_pretty(manifest).map_err(io::Error::other)?;
    text.push('\n');
    let directory = path.parent().unwrap_or_else(|| Path::new(""));
    if !directory.as_os_str().is_empty() {
        fs::create_dir_all(directory)?;
    }
    let temporary = if tracking {
        directory.join(format!("package.json.{}", std::process::id()))
    } else {
        directory.join(format!(".package.json.{}.tmp", std::process::id()))
    };
    if let Err(error) = fs::write(&temporary, text) {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        if !tracking {
            return Err(error);
        }
        return Err(rename_error(&temporary, path, error));
    }
    Ok(changed)
}
#[inline]
fn rename_error(from: &Path, to: &Path, error: io::Error) -> io::Error {
    // Node 22.22.0 libuv win/fs.c forwards MoveFileExW's error unchanged;
    // win/error.c translates ERROR_ACCESS_DENIED (5) to UV_EPERM.
    #[cfg(windows)]
    if error.raw_os_error() == Some(5) && to.is_dir() {
        return io::Error::other(format!(
            "EPERM: operation not permitted, rename '{}' -> '{}'",
            from.display(),
            to.display(),
        ));
    }
    if error.kind() == io::ErrorKind::IsADirectory {
        io::Error::other(format!(
            "EISDIR: illegal operation on a directory, rename '{}' -> '{}'",
            from.display(),
            to.display(),
        ))
    } else {
        error
    }
}
#[inline]
fn compact_json(text: &str) -> Option<String> {
    let trimmed = text.trim();
    (!trimmed.is_empty())
        .then(|| {
            serde_json::from_str::<serde_json::Value>(trimmed)
                .ok()
                .or_else(|| crate::jsonc::parse(trimmed).ok())
        })
        .flatten()
        .and_then(|value| serde_json::to_string(&value).ok())
}
