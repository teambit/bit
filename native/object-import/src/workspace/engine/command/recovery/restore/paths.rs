use super::{invalid, proof};
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};
pub(super) fn removals(
    root: &Path,
    current: &Value,
    bitmap_path: &Path,
    bitmap: &[u8],
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Vec<PathBuf>> {
    let roots = current
        .as_object()
        .ok_or_else(|| invalid("recovery bitmap"))?
        .values()
        .filter_map(|row| row["rootDir"].as_str())
        .filter(|root| *root != ".")
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let removal = crate::recovery::bitmap(bitmap_path, &roots)?;
    let previous = crate::recovery::jsonc::parse(bitmap)?;
    removal["removeDirs"]
        .as_array()
        .ok_or_else(|| invalid("recovery removal roots"))?
        .iter()
        .map(|row| {
            let directory = row.as_str().ok_or_else(|| invalid("recovery removal directory"))?;
            validate(root, directory, &previous)?;
            let path = root.join(directory);
            ancestors(root, &path, proofs)?;
            Ok(path)
        })
        .collect()
}
fn validate(root: &Path, directory: &str, previous: &Value) -> io::Result<()> {
    if Path::new(directory)
        .components()
        .any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return Err(invalid("recovery escaping directory"));
    }
    if root
        .join(directory)
        .starts_with(root.join(".bit"))
    {
        return Err(invalid("recovery scope removal"));
    }
    if previous
        .as_object()
        .ok_or_else(|| invalid("recovery restored roots"))?
        .values()
        .filter_map(|row| row["rootDir"].as_str())
        .any(|retained| {
            Path::new(retained).starts_with(directory) || Path::new(directory).starts_with(retained)
        })
    {
        return Err(invalid("recovery removal overlaps retained component"));
    }
    Ok(())
}
fn ancestors(root: &Path, path: &Path, proofs: &mut Vec<proof::Proof>) -> io::Result<()> {
    for ancestor in path
        .ancestors()
        .take_while(|ancestor| *ancestor != root)
    {
        let metadata = match std::fs::symlink_metadata(ancestor) {
            Ok(metadata) => Some(metadata),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        if metadata
            .as_ref()
            .is_some_and(|metadata| !metadata.is_dir() || metadata.file_type().is_symlink())
        {
            return Err(invalid("recovery removal ancestor"));
        }
        proofs.push(proof::metadata(ancestor, metadata.as_ref())?);
    }
    Ok(())
}

pub(super) fn staged(
    root: &Path,
    destination: &Path,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    if !destination.starts_with(root) {
        return Err(invalid("recovery staged path"));
    }
    match std::fs::symlink_metadata(destination) {
        Ok(metadata) if !metadata.is_file() || metadata.file_type().is_symlink() => {
            return Err(invalid("recovery staged destination"));
        }
        Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
        _ => {}
    }
    ancestors(root, destination.parent().ok_or_else(|| invalid("recovery staged parent"))?, proofs)
}
