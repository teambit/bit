//! Advance only the bitmap preimage acknowledged by a completed native fork publication.
use super::{ProjectedLinker, controls};
use crate::commands::engine::Engine;
use serde_json::Value;
use std::{io, path::Path};

impl ProjectedLinker {
    pub(in crate::commands) fn fork_bitmap_preimage(&self, root: &Path) -> io::Result<Value> {
        self.retained.validate()?;
        controls::refresh(&root.join(".bitmap"))
    }

    pub(in crate::commands) fn fork_bitmap_committed(
        &mut self,
        root: &Path,
        before: &Value,
        bitmap: &Value,
    ) -> io::Result<()> {
        let bytes = bit_object_import::render_workspace_bitmap(bitmap)?;
        let after =
            bit_install::policy::scope::proof_from_bytes(&root.join(".bitmap"), Some(&bytes));
        // The acknowledged publisher must have written exactly its planned bytes.
        let observed = controls::refresh(&root.join(".bitmap"))?;
        if observed != after {
            return Err(io::Error::other("fork bitmap publication changed"));
        }
        Engine::new()?
            .validate_read_set(std::slice::from_ref(&after), "fork bitmap publication changed")?;
        self.retained.advance_bitmap(before, &after)?;
        self.retained.validate()
    }
}
