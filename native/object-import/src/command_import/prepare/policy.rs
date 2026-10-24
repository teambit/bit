//! Read imported component policy metadata through the retained object proofs.
use super::{PreparedImport, Target, invalid, read_model, read_version, version_ref};
use serde_json::Value;
use std::io;

impl PreparedImport {
    pub(crate) fn policy_version(&mut self, target: &Target) -> io::Result<Value> {
        let local = self.environment.local_directory.clone();
        let model =
            read_model(self, &local, target)?.ok_or_else(|| invalid("inbound policy component"))?;
        let hash = version_ref(&model, &target.version)?;
        read_version(self, &hash)?.ok_or_else(|| invalid("inbound policy version"))
    }
}
