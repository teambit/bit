use super::{Prepared, Selected, invalid, planning};
use serde_json::json;
use std::{fs, io, path::Path};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Removed {
    pub(super) identity: String,
    pub(super) directory: String,
}

#[inline]
pub(super) fn validate(root: &Path, removed: &[Removed]) -> io::Result<()> {
    for row in removed {
        validate_one(root, row.directory.trim())?;
    }
    Ok(())
}

#[inline]
fn validate_one(root: &Path, directory: &str) -> io::Result<()> {
    crate::checkout::plan::relative_path(directory)?;
    if directory == "."
        || directory
            .split('/')
            .next()
            .is_some_and(|first| matches!(first, ".bit" | ".git"))
    {
        return Err(invalid("command removed workspace root"));
    }
    let mut path = root.to_path_buf();
    for segment in directory
        .split('/')
        .filter(|segment| !segment.is_empty())
    {
        path.push(segment);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_dir() => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
            _ => return Err(invalid("command removed directory is not ordinary")),
        }
    }
    Ok(())
}

pub(super) fn remove(root: &Path, removed: &[Removed]) -> io::Result<()> {
    validate(root, removed)?;
    for row in removed {
        let directory = root.join(row.directory.trim());
        match fs::remove_dir_all(&directory) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

pub(super) fn prepare(
    planned: &mut planning::Planned,
    prepared: &mut Prepared,
    selected: &[Selected],
) -> io::Result<()> {
    for (index, _) in selected
        .iter()
        .enumerate()
        .filter(|(_, row)| row.distance["shouldBeRemoved"] == true)
    {
        let current = &planned.captured[index];
        let directory = current.target.directory.trim();
        if current.hidden || directory.is_empty() || directory == "." {
            return Err(invalid("command removed component requires visible workspace files"));
        }
        let identity = current.target.identity.trim();
        prepared.publication.removed.push(Removed {
            identity: identity.to_owned(),
            directory: directory.to_owned(),
        });
        if let Some(rows) = planned.result["removedComponents"].as_array_mut() {
            rows.push(json!(identity));
        }
    }
    Ok(())
}
