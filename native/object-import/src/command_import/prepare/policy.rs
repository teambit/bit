//! Read imported component policy metadata through the retained object proofs.
use super::{PreparedImport, Target, invalid, read_model, read_version, version_ref};
use serde_json::Value;
use std::io;

impl PreparedImport {
    pub(crate) fn policy_version(&mut self, target: &Target) -> io::Result<Value> {
        let model = self.load_policy_model(target)?;
        let hash = version_ref(&model, target.version.trim())?;
        let version = read_version(self, &hash)?.ok_or_else(|| invalid("inbound policy version"))?;
        crate::history_query::validate_version(&version)?;
        Ok(version)
    }

    fn load_policy_model(&mut self, target: &Target) -> io::Result<Value> {
        let local = self.environment.local_directory.clone();
        read_model(self, &local, target)?.ok_or_else(|| invalid("inbound policy component"))
    }
}
