//! Accept only the exact component bytes ([`PreparedImport::accept_recovery_objects`]) already published by the recovery owner.
//!
//! Verifies on-disk loose object files via [`LooseObject`] and updates [`PreparedImport`] capture proofs after recovery writes.
use super::{PreparedImport, invalid};
use std::{fs, io, path::Path};

impl PreparedImport {
    /// Verifies and registers loose objects already published by the recovery phase, clearing overlay duplicates.
    pub(crate) fn accept_recovery_objects(
        &mut self,
        root: &Path,
        objects: &[(String, Vec<u8>)],
    ) -> io::Result<()> {
        if !root.is_absolute() || objects.len() > 4096 {
            return Err(invalid("import recovery object bounds"));
        }
        let objects_dir = crate::scope_path(root).join("objects");
        for (hash, bytes) in objects {
            if bytes.is_empty() || bytes.len() > 32 * 1024 * 1024 {
                return Err(invalid("import recovery object size"));
            }
            let trimmed = hash.trim();
            let canonical = crate::validate::hexadecimal(&crate::merge_history::hash(trimmed)?);
            let path = LooseObject::path(&objects_dir, &canonical);
            let metadata = fs::symlink_metadata(&path)?;
            if !metadata.is_file()
                || metadata.file_type().is_symlink()
                || u64::try_from(bytes.len()).ok() != Some(metadata.len())
                || fs::read(&path)? != *bytes
            {
                return Err(invalid("import restored component changed"));
            }
            self.capture.accept_known(&path, bytes);
            self.overlay.objects.remove(&canonical);
            self.overlay.objects.remove(trimmed);
            self.overlay.objects.remove(hash.as_str());
        }
        Ok(())
    }
}

/// Helper namespace for computing two-level loose object paths under `.bit/objects`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct LooseObject;
impl LooseObject {
    /// Compute the two-level loose object path (`<dir>/<xx>/<yyyy...>`) under `objects_dir` for `canonical_hash`.
    #[inline]
    fn path(objects_dir: &Path, canonical_hash: &str) -> std::path::PathBuf {
        objects_dir
            .join(&canonical_hash[..2])
            .join(&canonical_hash[2..])
    }
}
