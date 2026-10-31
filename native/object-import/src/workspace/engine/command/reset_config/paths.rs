use super::{invalid, proof};
use std::{fs, io, path::Path};

pub(super) fn capture(
    root: &Path,
    destination: &Path,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    if !destination.starts_with(root) || destination == root || destination.file_name().is_none() {
        return Err(invalid("reset config outside workspace"));
    }
    for (depth, parent) in destination
        .ancestors()
        .skip(1)
        .enumerate()
    {
        if depth > 64 {
            return Err(invalid("reset config ancestor depth"));
        }
        let metadata = ordinary_directory_metadata(parent)?;
        proofs.push(proof::metadata(parent, Some(&metadata))?);
        if parent == root {
            return Ok(());
        }
    }
    Err(invalid("reset config workspace ancestor"))
}

fn ordinary_directory_metadata(parent: &Path) -> io::Result<fs::Metadata> {
    let metadata = fs::symlink_metadata(parent)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(invalid("reset config ancestor is not ordinary"));
    }
    Ok(metadata)
}
