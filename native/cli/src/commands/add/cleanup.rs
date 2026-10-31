//! Consumer destruction cleans temporary files before publishing the bitmap.
use std::{fs, io, path::Path};

pub(super) fn temporary(root: &Path) -> io::Result<()> {
    // Published pathExists follows symlinks and treats inaccessible/missing paths
    // as absent. In particular, a dangling temporary symlink is left untouched.
    if has_temporary_path(root) {
        super::super::status::cleanup_temporary(root)?;
    }
    Ok(())
}

fn has_temporary_path(root: &Path) -> bool {
    !root.as_os_str().is_empty() && fs::metadata(root.join(".bitTmp")).is_ok()
}
