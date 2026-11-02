//! Advance only the `.bitmap` preimage acknowledged by a completed native fork publication on [`ProjectedLinker`].
//!
//! Validates and updates the retained `.bitmap` control entry via [`controls`] after `fork`.
use super::{ProjectedLinker, controls};
use crate::commands::engine::Engine;
use serde_json::Value;
use std::{io, path::Path};

impl ProjectedLinker {
    /// Captures and validates the current `.bitmap` preimage before a native `fork` write.
    #[inline]
    pub(in crate::commands) fn fork_bitmap_preimage(&self, root: &Path) -> io::Result<Value> {
        let path = bitmap_path(root)?;
        self.retained.validate()?;
        controls::refresh(&path)
    }

    /// Verifies and advances the retained `.bitmap` preimage from `before` to `bitmap` after `fork`.
    pub(in crate::commands) fn fork_bitmap_committed(
        &mut self,
        root: &Path,
        before: &Value,
        bitmap: &Value,
    ) -> io::Result<()> {
        let path = bitmap_path(root)?;
        if before["path"]
            .as_str()
            .map(str::trim)
            .map(Path::new)
            != Some(path.as_path())
        {
            return Err(io::Error::other("fork bitmap preimage path"));
        }
        let bytes = bit_object_import::render_workspace_bitmap(bitmap)?;
        let after = bit_install::policy::scope::proof_from_bytes(&path, Some(&bytes));
        if controls::refresh(&path)? != after {
            return Err(io::Error::other("fork bitmap publication changed"));
        }
        Engine::new()?
            .validate_read_set(std::slice::from_ref(&after), "fork bitmap publication changed")?;
        self.retained.advance_bitmap(before, &after)?;
        self.retained.validate()
    }
}

/// Validates that `root` is a non-empty absolute path and returns `root/.bitmap` for [`ProjectedLinker`].
#[inline]
fn bitmap_path(root: &Path) -> io::Result<std::path::PathBuf> {
    if !root.is_absolute()
        || root
            .as_os_str()
            .as_encoded_bytes()
            .iter()
            .all(u8::is_ascii_whitespace)
    {
        return Err(io::Error::other("fork bitmap workspace root is empty"));
    }
    Ok(root.join(".bitmap"))
}
