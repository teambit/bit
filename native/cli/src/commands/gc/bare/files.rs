//! Preserve `fs-extra.move(overwrite: true)` checks and the released filesystem errors.
use super::super::io_error::{failure, paired_failure};
use std::{fs, io, path::Path};

pub(in crate::commands::gc) fn preflight_moves(scope: &Path, hashes: &[String]) -> io::Result<()> {
    for hash in hashes {
        let (bucket, leaf) = split_hash(hash)?;
        let source = scope
            .join("objects")
            .join(bucket)
            .join(leaf);
        let target = scope
            .join("deleted-objects")
            .join(bucket)
            .join(leaf);
        let metadata = fs::symlink_metadata(&source)?;
        match metadata_if_present(&target, false) {
            Ok(existing) => check_target(&source, &target, &metadata, existing.as_ref())?,
            Err(error) if hashes.len() > 1 => return Err(error),
            Err(_) => {}
        }
    }
    Ok(())
}

pub(super) fn move_object(scope: &Path, hash: &str) -> io::Result<()> {
    let (bucket, leaf) = split_hash(hash)?;
    let source = scope
        .join("objects")
        .join(bucket)
        .join(leaf);
    let target = scope
        .join("deleted-objects")
        .join(bucket)
        .join(leaf);
    let metadata = fs::symlink_metadata(&source).map_err(|error| failure(error, "lstat", &source))?;
    let existing = metadata_if_present(&target, false)?;
    check_target(&source, &target, &metadata, existing.as_ref())?;
    check_parents(&source, &target)?;
    let parent = target.parent().ok_or_else(|| io::Error::other("gc deleted-objects parent"))?;
    fs::create_dir_all(parent).map_err(|error| failure(error, "mkdir", parent))?;
    if existing.is_some() {
        fs::remove_file(&target).map_err(|error| failure(error, "unlink", &target))?;
    }
    match fs::rename(&source, &target) {
        Err(error) if error.kind() == io::ErrorKind::CrossesDevices => {
            super::cross_device::copy_remove(&source, &target)
        }
        result => result.map_err(|error| paired_failure(error, "rename", &source, &target)),
    }
}

fn check_target(
    source: &Path,
    target: &Path,
    metadata: &fs::Metadata,
    existing: Option<&fs::Metadata>,
) -> io::Result<()> {
    let Some(existing) = existing else { return Ok(()) };
    if identical(metadata, existing) {
        return Err(io::Error::other("Source and destination must not be the same."));
    }
    if existing.is_dir() {
        return Err(io::Error::other(format!(
            "Cannot overwrite directory '{}' with non-directory '{}'.",
            target.display(),
            source.display(),
        )));
    }
    Ok(())
}
fn check_parents(source: &Path, target: &Path) -> io::Result<()> {
    for parent in target.ancestors().skip(1) {
        if Some(parent) == source.parent() || parent.parent().is_none() {
            break;
        }
        if metadata_if_present(parent, true)?.is_none() {
            break;
        }
    }
    Ok(())
}
fn metadata_if_present(path: &Path, follow: bool) -> io::Result<Option<fs::Metadata>> {
    let result = if follow { fs::metadata(path) } else { fs::symlink_metadata(path) };
    match result {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(failure(error, if follow { "stat" } else { "lstat" }, path)),
    }
}
#[cfg(unix)]
fn identical(first: &fs::Metadata, second: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    first.ino() != 0
        && first.dev() != 0
        && first.ino() == second.ino()
        && first.dev() == second.dev()
}
#[cfg(not(unix))]
fn identical(_: &fs::Metadata, _: &fs::Metadata) -> bool {
    false
}

fn split_hash(hash: &str) -> io::Result<(&str, &str)> {
    let trimmed = hash.trim();
    if !super::repository::hash(trimmed) {
        return Err(super::repository::unsupported("invalid object hash"));
    }
    Ok(trimmed.split_at(2))
}

/// Every operation in a `pMapPool` chunk starts, even when another member fails.
pub(in crate::commands::gc) fn move_batch(scope: &Path, hashes: &[String]) -> io::Result<()> {
    batch(hashes, |hash| move_object(scope, hash))
}
pub(in crate::commands::gc) fn batch<Item: Sync>(
    items: &[Item],
    work: impl Fn(&Item) -> io::Result<()> + Sync,
) -> io::Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    let (send, receive) = std::sync::mpsc::channel();
    std::thread::scope(|threads| {
        for item in items {
            let send = send.clone();
            let work = &work;
            threads.spawn(move || {
                let _ = send.send(work(item));
            });
        }
        drop(send);
        let mut first_error = None;
        for result in receive {
            if let Err(error) = result {
                first_error.get_or_insert(error);
            }
        }
        first_error.map_or(Ok(()), Err)
    })
}
/// Multi-chunk failure prefixes depend on the published glob traversal ordering.
pub(in crate::commands::gc) fn validate_batch(
    config: &serde_json::Value,
    count: usize,
) -> io::Result<()> {
    use bit_workspace_config::{
        config_string, effective_with_environment, global_config_dir, read_global_config,
    };
    let global = read_global_config(&global_config_dir())?;
    let values = effective_with_environment(
        &global,
        &config["config"],
        &serde_json::Value::Null,
        &["concurrency.io"],
        |key| std::env::var(key.trim()).ok(),
    );
    let value = values
        .get("concurrency.io")
        .and_then(config_string)
        .unwrap_or_default();
    let number = if value.trim().is_empty() {
        100
    } else {
        value
            .trim()
            .parse::<usize>()
            .map_err(|_| super::repository::unsupported("I/O concurrency configuration"))?
    };
    let limit = if number == 0 { 100 } else { number };
    if limit > 256 || count > limit {
        return Err(super::repository::unsupported("multi-batch collection ordering"));
    }
    Ok(())
}
