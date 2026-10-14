//! Filesystem primitives with the semantics of Bit's TypeScript helpers:
//! `createLinkOrSymlink`, `symlink-dir` and `hardLinkDirectory`.

use std::{
    fs, io,
    path::{Path, PathBuf},
    thread,
    time::Duration,
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

/// `EEXIST_MAX_ATTEMPTS` in `createLinkOrSymlink`.
const LINK_ATTEMPTS: u32 = 5;
/// `EEXIST_RETRY_DELAY_MS`, multiplied by the attempt number.
const LINK_RETRY_DELAY: Duration = Duration::from_millis(50);

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
    link_retrying_on_exists(src, dest, kind).or_else(|error| link_failure(src, dest, &error))
}

/// `writeLinkRetryingOnEexist`: a just-removed `dest` can still exist (on Windows a file
/// another process holds open stays "delete pending"), so `EEXIST` is retried a few times.
fn link_retrying_on_exists(src: &Path, dest: &Path, kind: LinkKind) -> io::Result<()> {
    let mut attempt = 1;
    loop {
        let error = match write_link(src, dest, kind) {
            Ok(()) => return Ok(()),
            Err(error) => error,
        };
        let retry = error.kind() == io::ErrorKind::AlreadyExists && attempt < LINK_ATTEMPTS;
        if !retry || linked_correctly(src, dest) {
            return Err(error);
        }
        thread::sleep(LINK_RETRY_DELAY * attempt);
        if linked_correctly(src, dest) {
            return Ok(());
        }
        remove_locked(dest)?;
        attempt += 1;
    }
}

/// The removal between attempts: a path still locked by another process is retried next time.
fn remove_locked(dest: &Path) -> io::Result<()> {
    match remove_path(dest) {
        Err(error) if locked(&error) => Ok(()),
        other => other,
    }
}

fn locked(error: &io::Error) -> bool {
    matches!(error.kind(), io::ErrorKind::PermissionDenied | io::ErrorKind::ResourceBusy)
}

fn write_link(src: &Path, dest: &Path, kind: LinkKind) -> io::Result<()> {
    match kind {
        LinkKind::Symlink => symlink_or_link(src, dest),
        LinkKind::HardLinkOrSymlink => link(src, dest),
    }
}

fn link_failure(src: &Path, dest: &Path, error: &io::Error) -> io::Result<()> {
    if error.kind() == io::ErrorKind::AlreadyExists && linked_correctly(src, dest) {
        return Ok(());
    }
    let copy = if cfg!(windows) { " (or maybe copy)" } else { "" };
    let message = format!(
        "failed to generate a symlink.\nSymlink{copy} from: {}, to: {} failed.\nOriginal error: {error}",
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
    real_path_is(dest, src) || fs::read_link(dest).is_ok_and(|target| target == src)
}

/// `fs.realpathSync(dest) === src`.
#[cfg(unix)]
fn real_path_is(dest: &Path, src: &Path) -> bool {
    fs::canonicalize(dest).is_ok_and(|real| real == src)
}

/// Rust's `canonicalize` returns a verbatim (`\\?\`) path with long names, where Node's
/// `realpathSync` returns a plain one, so both sides are canonicalized.
#[cfg(windows)]
fn real_path_is(dest: &Path, src: &Path) -> bool {
    same_file(src, dest)
}

/// `isDestLinkedCorrectly`: the same file (a hard link, or a link resolving to it), or a link
/// whose text is `src`.
fn linked_correctly(src: &Path, dest: &Path) -> bool {
    same_file(src, dest) || fs::read_link(dest).is_ok_and(|target| target == src)
}

#[cfg(unix)]
fn same_file(src: &Path, dest: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (fs::metadata(src), fs::metadata(dest)) {
        (Ok(src), Ok(dest)) => src.ino() != 0 && src.ino() == dest.ino() && src.dev() == dest.dev(),
        _ => false,
    }
}

/// Without a stable file index, Windows compares resolved paths: this recognizes symlinks and
/// junctions, not a hard link of `src`.
#[cfg(windows)]
fn same_file(src: &Path, dest: &Path) -> bool {
    matches!((fs::canonicalize(src), fs::canonicalize(dest)), (Ok(src), Ok(dest)) if src == dest)
}

/// `symlink()` with `avoidHardLink`: `symlink-dir` on unix; on Windows a true symlink
/// (`noJunction`), falling back to [`link`] when the user may not create symlinks.
fn symlink_or_link(src: &Path, dest: &Path) -> io::Result<()> {
    if cfg!(windows) {
        return true_symlink(src, dest).or_else(|_| link(src, dest));
    }
    true_symlink(src, dest)
}

/// `link()`: a hard link; a directory (`EPERM`) or a cross-device link gets a junction, which
/// on unix is a plain symlink. A relative `src` is relative to `dest`'s directory.
fn link(src: &Path, dest: &Path) -> io::Result<()> {
    match fs::hard_link(src, dest) {
        Ok(()) => Ok(()),
        Err(error) if junction_fallback(&error) || src.is_dir() => junction(src, dest),
        Err(error) if error.kind() == io::ErrorKind::NotFound && src.is_relative() => {
            relative_to_dest(src, dest)
        }
        Err(error) => Err(error),
    }
}

fn junction_fallback(error: &io::Error) -> bool {
    matches!(error.kind(), io::ErrorKind::PermissionDenied | io::ErrorKind::CrossesDevices)
}

/// The `ENOENT` branch of `link()`: Windows links the path resolved against `dest`'s
/// directory; unix symlinks the relative path as given.
fn relative_to_dest(src: &Path, dest: &Path) -> io::Result<()> {
    if !cfg!(windows) {
        return true_symlink(src, dest);
    }
    let absolute = dest
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .join(src);
    match fs::hard_link(&absolute, dest) {
        Err(error) if junction_fallback(&error) => junction(src, dest),
        other => other,
    }
}

/// `symlink-dir` without `noJunction`: a true symlink to `src` as given; on Windows a junction
/// when symlinks are not permitted.
pub(super) fn symlink_dir(src: &Path, dest: &Path) -> io::Result<()> {
    match true_symlink(src, dest) {
        Err(error) if cfg!(windows) && error.kind() == io::ErrorKind::PermissionDenied => {
            junction(src, dest)
        }
        other => other,
    }
}

#[cfg(unix)]
fn true_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

/// `fs.symlinkSync` without a type: Node picks a directory symlink when the target is a directory.
#[cfg(windows)]
fn true_symlink(target: &Path, link: &Path) -> io::Result<()> {
    let resolved = link
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .join(target);
    if resolved.is_dir() {
        std::os::windows::fs::symlink_dir(target, link)
    } else {
        std::os::windows::fs::symlink_file(target, link)
    }
}

#[cfg(unix)]
fn junction(target: &Path, link: &Path) -> io::Result<()> {
    true_symlink(target, link)
}

/// `fs.symlinkSync(target, link, 'junction')`: Node resolves the target to an absolute path.
#[cfg(windows)]
fn junction(target: &Path, link: &Path) -> io::Result<()> {
    let absolute = link
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .join(target);
    junction::create(absolute, link)
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
        symlink_dir(source, target)?;
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
