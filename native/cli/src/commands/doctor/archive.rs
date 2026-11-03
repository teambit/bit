//! Native diagnostic TAR writing ([`save`], [`Context`], [`Options`]); `.tar.gz` is intentionally not compressed.
#[cfg(test)]
mod tests;

use super::{context::Context, options::Options};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};
/// Writes a diagnostic TAR archive when `options.file` is requested via [`walk`] and [`append_results`], returning the saved filename.
pub(super) fn save(
    context: &Context,
    options: &Options,
    results: &[Value],
    meta: &Value,
) -> io::Result<Option<String>> {
    let Some(requested) = &options.file else {
        return Ok(None);
    };
    let filename = filename(requested, context.timestamp);
    let output = if filename.is_absolute() {
        filename.clone()
    } else {
        std::env::current_dir()?.join(&filename)
    };
    if let Some(parent) = output
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    if fs::symlink_metadata(&output).is_ok_and(|meta| meta.file_type().is_symlink()) {
        fs::remove_file(&output)?;
    }
    let file = fs::File::create(&output)?;
    let mut builder = tar::Builder::new(file);
    builder.follow_symlinks(false);
    if options.archive {
        builder.append_dir(".", &context.root)?;
        walk(&mut builder, &context.root, Path::new(""), &output, options)?;
    }
    append_results(&mut builder, results, meta)?;
    debug_log(&mut builder)?;
    if !options.archive {
        let bitmap_path = context.root.join(".bitmap");
        if bitmap_path.is_file() {
            append(&mut builder, ".bitmap", &fs::read(bitmap_path)?)?;
        }
    }
    builder.finish()?;
    Ok(Some(filename.to_string_lossy().into_owned()))
}
/// Appends `env-meta.json` and `doc-results.json` ([`Value`]) to the diagnostic TAR `builder` via [`append`].
#[inline]
fn append_results(
    builder: &mut tar::Builder<fs::File>,
    results: &[Value],
    meta: &Value,
) -> io::Result<()> {
    append(builder, "env-meta.json", &serde_json::to_vec_pretty(meta).map_err(io::Error::other)?)?;
    append(
        builder,
        "doc-results.json",
        &serde_json::to_vec_pretty(results).map_err(io::Error::other)?,
    )?;
    Ok(())
}
/// Appends a single regular file entry `name` with `bytes` to the GNU TAR `builder`.
#[inline]
fn append(builder: &mut tar::Builder<fs::File>, name: &str, bytes: &[u8]) -> io::Result<()> {
    let mut header = tar::Header::new_gnu();
    header.set_size(bytes.len() as u64);
    header.set_mode(0o644);
    header.set_mtime(chrono::Utc::now().timestamp().cast_unsigned());
    header.set_cksum();
    builder.append_data(&mut header, name, bytes)
}
/// Walks `root` in breadth-first directory order and appends non-excluded entries to `builder` per [`Options`].
fn walk(
    builder: &mut tar::Builder<fs::File>,
    root: &Path,
    relative: &Path,
    output: &Path,
    options: &Options,
) -> io::Result<()> {
    let mut queue = std::collections::VecDeque::from([relative.to_path_buf()]);
    while let Some(directory) = queue.pop_front() {
        let mut entries = fs::read_dir(root.join(directory))?.collect::<io::Result<Vec<_>>>()?;
        entries.sort_by_key(fs::DirEntry::file_name);
        for entry in entries {
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .map_err(io::Error::other)?
                .to_path_buf();
            if excluded_entry(&path, &relative, output, options) {
                continue;
            }
            if entry.file_type()?.is_dir() {
                builder.append_dir(&relative, &path)?;
                queue.push_back(relative);
            } else {
                builder.append_path_with_name(&path, relative)?;
            }
        }
    }
    Ok(())
}

fn excluded(path: &Path, options: &Options) -> bool {
    let parts = path
        .iter()
        .filter_map(|part| part.to_str())
        .collect::<Vec<_>>();
    let basename = parts
        .last()
        .copied()
        .unwrap_or_default();
    if basename == ".DS_Store" || previous_archive(basename) {
        return true;
    }
    if (!options.include.node_modules
        && parts[..parts.len().saturating_sub(1)].contains(&"node_modules"))
        || (!options.include.public && parts[..parts.len().saturating_sub(1)].contains(&"public"))
    {
        return true;
    }
    if parts.first() == Some(&".git") && parts.len() > 1 && parts.get(1) != Some(&"bit") {
        return true;
    }
    let scope = parts.first() == Some(&".bit") || parts.starts_with(&[".git", "bit"]);
    options.include.exclude_scope
        && scope
        && parts[..parts.len().saturating_sub(1)]
            .iter()
            .any(|part| matches!(*part, "objects" | "cache" | "tmp"))
}
#[inline]
fn previous_archive(name: &str) -> bool {
    let lowered = name.trim().to_ascii_lowercase();
    lowered
        .strip_prefix("doctor-results-")
        .and_then(|rest| {
            rest.strip_suffix(".tar.gz")
                .or_else(|| rest.strip_suffix(".tar"))
        })
        .is_some_and(|stamp| !stamp.is_empty() && stamp.bytes().all(|byte| byte.is_ascii_digit()))
}
pub(super) fn filename(path: &Path, timestamp: i64) -> PathBuf {
    let trimmed = path.to_str().map_or(path, |raw| Path::new(raw.trim()));
    if trimmed.as_os_str().is_empty() || trimmed == Path::new(".") {
        return PathBuf::from(format!("doctor-results-{timestamp}.tar"));
    }
    let lowered = trimmed.to_string_lossy().to_ascii_lowercase();
    if lowered.ends_with(".tar") || lowered.ends_with(".tar.gz") {
        return trimmed.to_path_buf();
    }
    trimmed.with_extension("tar")
}

#[inline]
fn debug_log(builder: &mut tar::Builder<fs::File>) -> io::Result<()> {
    let path = crate::commands::status::cache::cache_root().join("logs/debug.log");
    match fs::read_to_string(path) {
        Ok(text) => append(builder, "debug.log", super::report::strip(&text).as_bytes()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[inline]
fn excluded_entry(path: &Path, relative: &Path, output: &Path, options: &Options) -> bool {
    path == output
        || excluded(relative, options)
        || fs::canonicalize(path)
            .ok()
            .zip(fs::canonicalize(output).ok())
            .is_some_and(|(left, right)| left == right)
}
