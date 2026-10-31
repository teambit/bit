//! Copy backup entries with the released fs-extra traversal and overwrite rules.
mod check;
use super::super::io_error::{failure, paired_failure};
use std::{fs, io, path::Path};

pub(super) fn preflight(source: &Path, target: &Path) -> io::Result<()> {
    if source.as_os_str().is_empty() || target.as_os_str().is_empty() || source == target {
        return Err(io::Error::other("Source and destination must not be the same."));
    }
    let metadata = fs::symlink_metadata(source)?;
    let destination = existing(target)?;
    check::target(source, target, &metadata, destination.as_ref())?;
    check::parents(source, target, &metadata)?;
    if metadata.is_dir() {
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            preflight(&entry.path(), &target.join(entry.file_name()))?;
        }
    }
    #[cfg(unix)]
    if metadata.file_type().is_symlink()
        && destination.is_some_and(|metadata| metadata.file_type().is_symlink())
    {
        link_target(&fs::read_link(source)?, target)?;
    }
    Ok(())
}

pub(super) fn run(src: &Path, dst: &Path, overwrite: bool) -> io::Result<()> {
    let metadata = fs::symlink_metadata(src).map_err(|error| failure(error, "lstat", src))?;
    check::parents(src, dst, &metadata)?;
    entry(src, dst, overwrite)
}

fn entry(src: &Path, dst: &Path, overwrite: bool) -> io::Result<()> {
    let metadata = fs::symlink_metadata(src).map_err(|error| failure(error, "lstat", src))?;
    let destination = existing(dst)?;
    check::target(src, dst, &metadata, destination.as_ref())?;
    if metadata.is_dir() {
        directory(src, dst, overwrite, destination.is_some())
    } else if metadata.file_type().is_symlink() {
        copy_restore_link(src, dst)
    } else {
        copy_file(src, dst, overwrite)
    }
}
fn directory(src: &Path, dst: &Path, overwrite: bool, existed: bool) -> io::Result<()> {
    fs::create_dir_all(dst).map_err(|error| failure(error, "mkdir", dst))?;
    let mut entries = fs::read_dir(src)
        .map_err(|error| failure(error, "scandir", src))?
        .collect::<io::Result<Vec<_>>>()?;
    entries.sort_by_key(fs::DirEntry::file_name);
    for item in entries.into_iter().rev() {
        entry(&item.path(), &dst.join(item.file_name()), overwrite)?;
    }
    if !existed {
        fs::set_permissions(dst, fs::metadata(src)?.permissions())
            .map_err(|error| failure(error, "chmod", dst))?;
    }
    Ok(())
}
fn copy_file(source: &Path, target: &Path, overwrite: bool) -> io::Result<()> {
    if existing(target)?.is_some() {
        if !overwrite {
            return Ok(());
        }
        fs::remove_file(target).map_err(|error| failure(error, "unlink", target))?;
    }
    fs::copy(source, target).map_err(|error| paired_failure(error, "copyfile", source, target))?;
    Ok(())
}

#[cfg(unix)]
fn copy_restore_link(source: &Path, target: &Path) -> io::Result<()> {
    let link = fs::read_link(source).map_err(|error| failure(error, "readlink", source))?;
    if link.as_os_str().is_empty() {
        return Err(failure(io::Error::from(io::ErrorKind::InvalidInput), "readlink", source));
    }
    if existing(target)?.is_some_and(|metadata| metadata.file_type().is_symlink()) {
        link_target(&link, target)?;
        fs::remove_file(target).map_err(|error| failure(error, "unlink", target))?;
    }
    std::os::unix::fs::symlink(&link, target)
        .map_err(|error| paired_failure(error, "symlink", &link, target))
}

#[cfg(unix)]
fn link_target(link: &Path, target: &Path) -> io::Result<()> {
    let destination = fs::read_link(target).map_err(|error| failure(error, "readlink", target))?;
    if normalized(&destination)?.starts_with(normalized(link)?) {
        return Err(io::Error::other(format!(
            "Cannot copy '{}' to a subdirectory of itself, '{}'.",
            link.display(),
            destination.display(),
        )));
    }
    Ok(())
}

fn existing(path: &Path) -> io::Result<Option<fs::Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(failure(error, "lstat", path)),
    }
}

#[cfg(unix)]
fn normalized(path: &Path) -> io::Result<std::path::PathBuf> {
    use std::path::{Component, PathBuf};
    let mut result = PathBuf::new();
    for component in std::path::absolute(path)?.components() {
        match component {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            _ => result.push(component.as_os_str()),
        }
    }
    Ok(result)
}
#[cfg(windows)]
fn copy_restore_link(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::fs::{FileTypeExt, symlink_dir, symlink_file};
    let link = fs::read_link(source)?;
    if fs::symlink_metadata(source)?.file_type().is_symlink_dir() {
        symlink_dir(link, target)
    } else {
        symlink_file(link, target)
    }
}
