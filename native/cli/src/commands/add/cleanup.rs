//! Consumer destruction cleans [`temporary`] files before publishing `.bitmap`.
//!
//! Removes `.bitTmp` when it exists as a live filesystem entry under the workspace root.
use std::{fs, io, path::Path};

#[inline]
pub(super) fn temporary(root: &Path) -> io::Result<()> {
    // Published pathExists follows symlinks and treats inaccessible/missing paths
    // as absent. In particular, a dangling temporary symlink is left untouched.
    if has_temporary_path(root) {
        super::super::status::cleanup_temporary(root)?;
    }
    Ok(())
}

#[inline]
fn has_temporary_path(root: &Path) -> bool {
    root.is_absolute()
        && root
            .to_str()
            .map_or(!root.as_os_str().is_empty(), |text| !text.trim().is_empty())
        && fs::metadata(root.join(".bitTmp")).is_ok()
}
