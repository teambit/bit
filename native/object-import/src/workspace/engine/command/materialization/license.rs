//! Scope [`Prepared`] licenses via [`prepare`] are separate writes, never `Version` `Source` bodies.

use super::{Input, invalid, validate_path};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Validated destination [`PathBuf`] and contents for a component `LICENSE` file write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Prepared {
    path: PathBuf,
    contents: String,
}

/// Prepares a validated `LICENSE` file write for `input` when `license` content is present.
pub(super) fn prepare(input: &Input<'_>, license: Option<&str>) -> io::Result<Option<Prepared>> {
    let Some(contents) = license else { return Ok(None) };
    if contents.len() > 4 * 1024 * 1024 || contents.contains('\0') {
        return Err(invalid("command license byte budget"));
    }
    let directory = input.current.target.directory.trim();
    if directory.is_empty() {
        return Err(invalid("command license target directory"));
    }
    let path = if directory == "." {
        input.root.join("LICENSE")
    } else {
        crate::checkout::plan::relative_path(directory)?;
        input.root.join(directory).join("LICENSE")
    };
    validate_destination(&path, input.root)?;
    Ok(Some(Prepared { path, contents: contents.to_owned() }))
}

impl Prepared {
    /// Revalidates that `self.path` remains an ordinary destination under `root`.
    #[inline]
    pub(super) fn validate(&self, root: &Path) -> io::Result<()> {
        validate_destination(&self.path, root)
    }
    /// Writes `self.contents` to `self.path`.
    #[inline]
    pub(super) fn commit(&self) -> io::Result<()> {
        crate::merge_state::write::commit(&self.path, &self.contents)
    }
}

#[inline]
fn validate_destination(path: &Path, root: &Path) -> io::Result<()> {
    validate_path(path, root)?;
    match fs::symlink_metadata(path) {
        Ok(_) => crate::merge_state::write::validate_existing(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
