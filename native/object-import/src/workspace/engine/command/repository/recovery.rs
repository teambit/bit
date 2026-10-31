//! Project retained model proofs after the recovery owner has restored main's component objects.
use super::{Repository, proof};
use std::{io, path::Path};

impl Repository {
    pub(in crate::workspace::engine::command) fn accept_recovery_objects(
        &mut self,
        root: &Path,
        objects: &[(String, Vec<u8>)],
    ) -> io::Result<()> {
        if let Some(imported) = &mut self.imported {
            imported.accept_recovery_objects(root, objects)?;
        }
        for (hash, bytes) in objects {
            if hash.len() < 3 || !hash.is_char_boundary(2) {
                continue;
            }
            let path = self.directory
                .join(&hash[..2])
                .join(&hash[2..]);
            for row in self.proofs
                .iter_mut()
                .filter(|row| row.path == path)
            {
                *row = proof::restored_control(row, Some(bytes))?;
            }
            self.values.remove(&(hash.clone(), "Component".into()));
        }
        Ok(())
    }
}
