//! Node recursive removal: try the directory itself before touching its children.
use std::{fs, io, path::Path};

pub(super) fn remove(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() => return remove_directory(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        #[cfg(windows)]
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
            return repair_permissions(path, error, "lstat");
        }
        _ => {}
    }
    match unlink(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        #[cfg(windows)]
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
            repair_permissions(path, error, "unlink")
        }
        Err(error) if error.kind() == io::ErrorKind::IsADirectory => remove_directory(path),
        Err(error) => Err(failure(error, "unlink", path)),
        Ok(()) => Ok(()),
    }
}

fn remove_directory(path: &Path) -> io::Result<()> {
    match fs::remove_dir(path) {
        Ok(()) => return Ok(()),
        Err(error)
            if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) =>
        {
            return Ok(());
        }
        Err(error) if children_may_remain(&error) => {}
        Err(error) => return Err(failure(error, "rmdir", path)),
    }
    let children = fs::read_dir(path).map_err(|error| failure(error, "scandir", path))?;
    let mut first_error = None;
    for child in children {
        let result = child
            .map_err(|error| failure(error, "scandir", path))
            .and_then(|child| remove(&child.path()));
        if let Err(error) = result {
            first_error.get_or_insert(error);
        }
    }
    if let Some(error) = first_error {
        return Err(error);
    }
    fs::remove_dir(path).map_err(|error| failure(error, "rmdir", path))
}

fn failure(error: io::Error, operation: &str, path: &Path) -> io::Error {
    let (code, message) = match error.kind() {
        io::ErrorKind::PermissionDenied if cfg!(windows) => ("EPERM", "operation not permitted"),
        io::ErrorKind::PermissionDenied => ("EACCES", "permission denied"),
        io::ErrorKind::NotFound => ("ENOENT", "no such file or directory"),
        io::ErrorKind::NotADirectory => ("ENOTDIR", "not a directory"),
        io::ErrorKind::IsADirectory => ("EISDIR", "illegal operation on a directory"),
        io::ErrorKind::DirectoryNotEmpty => ("ENOTEMPTY", "directory not empty"),
        io::ErrorKind::InvalidFilename => ("ENAMETOOLONG", "name too long"),
        _ => return error,
    };
    io::Error::new(error.kind(), format!("{code}: {message}, {operation} '{}'", path.display()))
}

fn children_may_remain(error: &io::Error) -> bool {
    matches!(error.kind(), io::ErrorKind::DirectoryNotEmpty | io::ErrorKind::AlreadyExists)
        || (cfg!(windows) && error.kind() == io::ErrorKind::PermissionDenied)
}

#[cfg(not(windows))]
fn unlink(path: &Path) -> io::Result<()> {
    fs::remove_file(path)
}

#[cfg(windows)]
fn unlink(path: &Path) -> io::Result<()> {
    use std::os::windows::fs::FileTypeExt;
    if fs::symlink_metadata(path)?.file_type().is_symlink_dir() {
        fs::remove_dir(path)
    } else {
        fs::remove_file(path)
    }
}

#[cfg(windows)]
fn repair_permissions(path: &Path, original: io::Error, operation: &str) -> io::Result<()> {
    let repair = || {
        let mut permissions = fs::metadata(path)?.permissions();
        permissions.set_readonly(false);
        fs::set_permissions(path, permissions)?;
        fs::metadata(path)
    };
    match repair() {
        Ok(metadata) if metadata.is_dir() => remove_directory(path),
        Ok(_) => unlink(path).map_err(|error| failure(error, "unlink", path)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(failure(original, operation, path)),
    }
}
