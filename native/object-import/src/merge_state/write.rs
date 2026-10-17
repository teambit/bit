#[cfg(windows)]
mod windows;
use super::invalid;
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::Path,
};

pub(crate) fn commit(path: &Path, contents: &str) -> io::Result<()> {
    let name = path.to_str().ok_or_else(|| invalid("non-UTF8 merge state path"))?;
    if !path.is_absolute() || name.len() > 32768 || name.contains('\0') {
        return Err(invalid("invalid merge state path"));
    }
    let existing = match fs::symlink_metadata(path) {
        Ok(metadata) => Some(metadata),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    let mut file = open(path, existing.as_ref())?;
    file.set_len(0)?;
    file.write_all(contents.as_bytes())
}
/// Check the same held-file identity rules as `commit` before a larger plan
/// starts publishing unrelated files. Opening here never truncates the file.
pub(crate) fn validate_existing(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() {
        return Err(invalid("unsupported merge state file"));
    }
    drop(existing_file(path, &metadata)?);
    Ok(())
}
fn open(path: &Path, existing: Option<&fs::Metadata>) -> io::Result<fs::File> {
    let Some(metadata) = existing else {
        fs::create_dir_all(path.parent().ok_or_else(|| invalid("missing merge state parent"))?)?;
        return OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path);
    };
    if !metadata.is_file() {
        return Err(invalid("unsupported merge state file"));
    }
    existing_file(path, metadata)
}
#[cfg(windows)]
fn existing_file(path: &Path, _metadata: &fs::Metadata) -> io::Result<fs::File> {
    windows::open(path)
}
#[cfg(not(windows))]
fn existing_file(path: &Path, metadata: &fs::Metadata) -> io::Result<fs::File> {
    if !single_link(metadata) {
        return Err(invalid("unsupported merge state file"));
    }
    let file = OpenOptions::new().write(true).open(path)?;
    if !same_file(metadata, &file.metadata()?) {
        return Err(invalid("merge state file changed"));
    }
    Ok(file)
}
#[cfg(not(windows))]
fn single_link(metadata: &fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        metadata.nlink() == 1
    }
    #[cfg(not(unix))]
    {
        let _metadata = metadata;
        false
    }
}
#[cfg(not(windows))]
fn same_file(before: &fs::Metadata, after: &fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        before.dev() == after.dev() && before.ino() == after.ino()
    }
    #[cfg(not(unix))]
    {
        let _metadata = (before, after);
        false
    }
}
