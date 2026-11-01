//! Read imported component policy metadata through the retained object proofs.
use super::{PreparedImport, Target, invalid, read_model, read_version, version_ref};
use serde_json::Value;
use std::io;

impl PreparedImport {
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
