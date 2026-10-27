//! Accept only the exact component bytes already published by the recovery owner.
use super::{PreparedImport, invalid};
use std::{fs, io, path::Path};

impl PreparedImport {
    pub(crate) fn accept_recovery_objects(
        &mut self,
        root: &Path,
        objects: &[(String, Vec<u8>)],
    ) -> io::Result<()> {
        for (hash, bytes) in objects {
            crate::merge_history::hash(hash)?;
            let path = crate::scope_path(root)
                .join("objects")
                .join(&hash[..2])
                .join(&hash[2..]);
            if fs::read(&path)? != *bytes {
                return Err(invalid("import restored component changed"));
            }
            self.capture.accept_known(&path, bytes);
            self.overlay.objects.remove(hash);
        }
        Ok(())
    }
}
