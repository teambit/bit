//! Project retained model [`proof`] records on [`Repository`] via [`Repository::accept_recovery_objects`] and [`proof::restored_control`] after restoring `main`'s `Component` objects.

use super::{Repository, proof};
use std::{io, path::Path};

impl Repository {
    /// Updates cached [`proof::Proof`] entries via [`proof::restored_control`] and evicts stale `Component` entries on [`Repository`] after restoring `objects` under `root`.
    #[inline]
    pub(in crate::workspace::engine::command) fn accept_recovery_objects(
        &mut self,
        root: &Path,
        objects: &[(String, Vec<u8>)],
    ) -> io::Result<()> {
        if let Some(imported) = &mut self.imported {
            imported.accept_recovery_objects(root, objects)?;
        }
        for (hash, bytes) in objects {
            let Ok(digest) = crate::merge_history::hash(hash) else {
                continue;
            };
            let hash = crate::validate::hexadecimal(&digest);
            let path = self.directory
                .join(&hash[..2])
                .join(&hash[2..]);
            for row in self.proofs
                .iter_mut()
                .filter(|row| row.path == path)
            {
                *row = proof::restored_control(row, Some(bytes))?;
            }
            self.values.remove(&(hash, "Component".into()));
        }
        Ok(())
    }
}
