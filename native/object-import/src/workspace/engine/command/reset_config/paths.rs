use super::{invalid, proof};
use std::{fs, io, path::Path};

pub(super) fn capture(
    root: &Path,
    destination: &Path,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    if !destination.starts_with(root) {
        return Err(invalid("reset config outside workspace"));
    }
    for parent in destination.ancestors().skip(1) {
        let metadata = fs::symlink_metadata(parent)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(invalid("reset config ancestor is not ordinary"));
        }
        proofs.push(proof::metadata(parent, Some(&metadata))?);
        if parent == root {
            return Ok(());
        }
    }
    Err(invalid("reset config workspace ancestor"))
}
