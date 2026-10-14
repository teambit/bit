//! Filesystem primitives with the semantics of Bit's TypeScript helpers:
//! `createLinkOrSymlink`, `symlink-dir` and `hardLinkDirectory`.

use std::{
    ffi::OsString,
    fs, io,
    path::{Component, Path, PathBuf},
};

/// How [`create_link_or_symlink`] links a path (`avoidHardLink` in TypeScript).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum LinkKind {
    /// An absolute symlink, as `Symlink.write` creates for component files.
    Symlink,
    /// A hard link for files; directories fall back to an absolute symlink (a junction on Windows).
    HardLinkOrSymlink,
}

/// `lstat` says the path is a symlink.
pub(super) fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink())
}

/// `removeSymlinkTarget`: a target may be linked unless something other than a symlink is
/// already there (and the workspace has no local bit installation).
pub(super) fn may_link_target(target: &Path, has_local_installation: bool) -> bool {
    match fs::symlink_metadata(target) {
        Ok(meta) if !has_local_installation => meta.file_type().is_symlink(),
        _ => true,
    }
}

/// `fs.remove`: delete a file, symlink or directory tree; a missing path is fine.
pub(super) fn remove_path(path: &Path) -> io::Result<()> {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if meta.is_dir() {
        return fs::remove_dir_all(path);
    }
    fs::remove_file(path).or_else(|error| remove_dir_link(path, error))
}

/// A directory symlink or junction on Windows is removed with `remove_dir`.
fn remove_dir_link(path: &Path, error: io::Error) -> io::Result<()> {
    if cfg!(windows) { fs::remove_dir(path) } else { Err(error) }
}

/// `createLinkOrSymlink`: replace `dest` with a link to `src`.
pub(super) fn create_link_or_symlink(
    src: &Path,
    dest: &Path,
    kind: LinkKind,
    skip_if_valid: bool,
) -> io::Result<()> {
    if skip_if_valid && points_to(dest, src) {
        return Ok(());
    }
    remove_path(dest)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let linked = match kind {
        LinkKind::Symlink => symlink_absolute(src, dest),
        LinkKind::HardLinkOrSymlink => hard_link_or_symlink(src, dest),
    };
    linked.or_else(|error| link_failure(src, dest, &error))
}

fn link_failure(src: &Path, dest: &Path, error: &io::Error) -> io::Result<()> {
    if error.kind() == io::ErrorKind::AlreadyExists && points_to(dest, src) {
        return Ok(());
    }
    let message = format!(
        "failed to generate a symlink.\nSymlink from: {}, to: {} failed.\nOriginal error: {error}",
        src.display(),
        dest.display(),
    );
    Err(io::Error::new(error.kind(), message))
}

/// `dest` exists and resolves to `src`, or its link text is `src`.
fn points_to(dest: &Path, src: &Path) -> bool {
    if !dest.exists() {
        return false;
    }
    fs::canonicalize(dest).is_ok_and(|real| real == src)
        || fs::read_link(dest).is_ok_and(|target| target == src)
}

fn hard_link_or_symlink(src: &Path, dest: &Path) -> io::Result<()> {
    if src.is_dir() {
        return symlink_absolute(src, dest);
    }
    match fs::hard_link(src, dest) {
        Ok(()) => Ok(()),
        Err(error) if hard_link_unsupported(&error) => symlink_absolute(src, dest),
        Err(error) if error.kind() == io::ErrorKind::NotFound && src.is_relative() => {
            symlink_absolute(src, dest)
        }
        Err(error) => Err(error),
    }
}

fn hard_link_unsupported(error: &io::Error) -> bool {
    matches!(error.kind(), io::ErrorKind::PermissionDenied | io::ErrorKind::CrossesDevices)
}

/// `symlink-dir`: a symlink relative to the link's directory.
pub(super) fn symlink_relative(src: &Path, dest: &Path) -> io::Result<()> {
    if cfg!(windows) {
        return symlink_absolute(src, dest);
    }
    let parent = dest.parent().unwrap_or_else(|| Path::new(""));
    platform_symlink(&relative_path(parent, src), dest, src.is_dir())
}

fn symlink_absolute(src: &Path, dest: &Path) -> io::Result<()> {
    platform_symlink(src, dest, src.is_dir())
}

#[cfg(unix)]
fn platform_symlink(target: &Path, link: &Path, _is_dir: bool) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn platform_symlink(target: &Path, link: &Path, is_dir: bool) -> io::Result<()> {
    if is_dir {
        std::os::windows::fs::symlink_dir(target, link)
    } else {
        std::os::windows::fs::symlink_file(target, link).or_else(|_| fs::hard_link(target, link))
    }
}

/// The path from directory `from` to `to`, both absolute (`path.relative`).
pub(super) fn relative_path(from: &Path, to: &Path) -> PathBuf {
    let from = normalize(from);
    let to = normalize(to);
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();
    let ups = from.len() - common;
    let mut relative: PathBuf = std::iter::repeat_n(OsString::from(".."), ups).collect();
    relative.extend(&to[common..]);
    relative
}

/// Lexical `.`/`..` resolution, as `path.resolve` does.
fn normalize(path: &Path) -> Vec<OsString> {
    let mut parts: Vec<OsString> = Vec::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                parts.pop();
            }
            other => parts.push(other.as_os_str().to_owned()),
        }
    }
    parts
}

/// `hardLinkDirectory`: hard link every file under `src` (except `node_modules`) into each of
/// `dest_dirs`. Symlinked directories become symlinks; broken links are skipped.
pub(super) fn hard_link_directory(src: &Path, dest_dirs: &[PathBuf]) -> io::Result<()> {
    if dest_dirs.is_empty() {
        return Ok(());
    }
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        if entry.file_name() == "node_modules" {
            continue;
        }
        let file_type = entry.file_type()?;
        let targets: Vec<PathBuf> = dest_dirs
            .iter()
            .map(|dir| dir.join(entry.file_name()))
            .collect();
        if file_type.is_dir() {
            hard_link_subdirectory(&entry.path(), &targets)?;
        } else {
            hard_link_entry(&entry.path(), file_type.is_symlink(), &targets)?;
        }
    }
    Ok(())
}

fn hard_link_subdirectory(src: &Path, targets: &[PathBuf]) -> io::Result<()> {
    for target in targets {
        fs::create_dir_all(target)?;
    }
    hard_link_directory(src, targets)
}

fn hard_link_entry(src: &Path, is_symlink: bool, targets: &[PathBuf]) -> io::Result<()> {
    let source = if is_symlink { resolve_link_target(src)? } else { src.to_path_buf() };
    if is_symlink {
        match fs::metadata(&source) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error),
            Ok(meta) if meta.is_dir() => return symlink_each(&source, targets),
            Ok(_) => {}
        }
    }
    for target in targets {
        link_file(&source, target)?;
    }
    Ok(())
}

fn symlink_each(source: &Path, targets: &[PathBuf]) -> io::Result<()> {
    for target in targets {
        // `read_dir` order is platform-defined: a symlinked directory can come
        // before any entry that would have created the destination.
        fs::create_dir_all(target.parent().unwrap_or_else(|| Path::new("")))?;
        remove_path(target)?;
        symlink_relative(source, target)?;
    }
    Ok(())
}

/// `resolve-link-target`: the absolute target of one symlink level.
fn resolve_link_target(link: &Path) -> io::Result<PathBuf> {
    let target = fs::read_link(link)?;
    let parent = link.parent().unwrap_or_else(|| Path::new(""));
    Ok(parent.join(target))
}

fn link_file(src: &Path, dest: &Path) -> io::Result<()> {
    let linked = match fs::hard_link(src, dest) {
        Err(error) if error.kind() == io::ErrorKind::NotFound && !src.exists() => return Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir_all(dest.parent().unwrap_or_else(|| Path::new("")))?;
            fs::hard_link(src, dest)
        }
        other => other,
    };
    match linked {
        Err(error) if error.kind() == io::ErrorKind::CrossesDevices => {
            fs::copy(src, dest).map(drop)
        }
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        other => other,
    }
}

#[cfg(test)]
mod tests;
