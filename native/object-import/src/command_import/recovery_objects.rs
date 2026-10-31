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
            let canonical = crate::validate::hexadecimal(&crate::merge_history::hash(hash.trim())?);
            let path = LooseObject::path(&crate::scope_path(root), &canonical);
            if fs::read(&path)? != *bytes {
                return Err(invalid("import restored component changed"));
            }
            self.capture.accept_known(&path, bytes);
            self.overlay.objects.remove(&canonical);
            self.overlay.objects.remove(hash.as_str());
        }
        Ok(())
    }
}

struct LooseObject;
impl LooseObject {
    fn path(scope: &Path, canonical_hash: &str) -> std::path::PathBuf {
        scope
            .join("objects")
            .join(&canonical_hash[..2])
            .join(&canonical_hash[2..])
    }
}
