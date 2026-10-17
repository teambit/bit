//! Scope licenses are separate Vinyl writes, never tracked Version Source bodies.
use super::{Input, invalid, validate_path};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Prepared {
    path: PathBuf,
    contents: String,
}

pub(super) fn prepare(input: &Input<'_>, license: Option<&str>) -> io::Result<Option<Prepared>> {
    let Some(contents) = license else { return Ok(None) };
    let path = input.root.join(&input.current.target.directory).join("LICENSE");
    validate_destination(&path, input.root)?;
    if contents.len() > 4 * 1024 * 1024 {
        return Err(invalid("command license byte budget"));
    }
    Ok(Some(Prepared { path, contents: contents.to_owned() }))
}

impl Prepared {
    pub(super) fn validate(&self, root: &Path) -> io::Result<()> {
        validate_destination(&self.path, root)
    }
    pub(super) fn commit(&self) -> io::Result<()> {
        crate::merge_state::write::commit(&self.path, &self.contents)
    }
}

fn validate_destination(path: &Path, root: &Path) -> io::Result<()> {
    validate_path(path, root)?;
    match fs::symlink_metadata(path) {
        Ok(_) => crate::merge_state::write::validate_existing(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
