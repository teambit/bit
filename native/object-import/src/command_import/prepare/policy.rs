//! Read imported component policy metadata through the retained object proofs.
//!
//! Resolves `Version` objects for inbound policy inspection via [`PreparedImport::policy_version`] from the overlay or local scope.
//! Validates each resolved `Version` object with [`crate::history_query::validate_version`] before returning.
use super::{PreparedImport, Target, invalid, read_model, read_version, version_ref};
use serde_json::Value;
use std::io;

impl PreparedImport {
    /// Resolve and validate the `Version` [`Value`] for [`Target`] from `self.overlay` ([`read_model`], [`version_ref`], [`read_version`]) or the local scope (returning [`invalid`] on missing models).
    #[inline]
    pub(crate) fn policy_version(&mut self, target: &Target) -> io::Result<Value> {
        let local = self.environment.local_directory.clone();
        let model =
            read_model(self, &local, target)?.ok_or_else(|| invalid("inbound policy component"))?;
        let hash = version_ref(&model, target.version.trim())?;
        if let Some(version) = self.overlay.read(&hash, "Version")? {
            crate::history_query::validate_version(version)?;
            return Ok(version.clone());
        }
        let version = read_version(self, &hash)?.ok_or_else(|| invalid("inbound policy version"))?;
        crate::history_query::validate_version(&version)?;
        Ok(version)
    }
}
