//! Consumer destruction cleans temporary files before publishing the bitmap.
use std::{fs, io, path::Path};

pub(super) fn temporary(root: &Path) -> io::Result<()> {
    // Published pathExists follows symlinks and treats inaccessible/missing paths
    // as absent. In particular, a dangling temporary symlink is left untouched.
    if fs::metadata(root.join(".bitTmp")).is_ok() {
        super::super::status::cleanup_temporary(root)?;
    }
    Ok(())
}
