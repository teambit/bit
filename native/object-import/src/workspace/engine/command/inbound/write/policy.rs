//! Shared `ConfigMerger` policy inputs for imported component versions.
use super::super::{config, invalid};
use serde_json::Value;
use std::{io, path::Path};

pub(super) fn receipt(
    root: &Path,
    targets: &[super::Target],
    imported: &mut crate::command_import::PreparedImport,
) -> io::Result<Option<Value>> {
    let workspace = config::document(&root.join("workspace.jsonc"))?;
    let policy = &workspace["teambit.dependencies/dependency-resolver"]["policy"];
    if ["dependencies", "devDependencies", "peerDependencies"]
        .iter()
        .all(|field| policy[*field].as_object().is_none_or(serde_json::Map::is_empty))
    {
        return Ok(None);
    }
    let mut versions = Vec::new();
    for target in targets {
        versions.push(imported.policy_version(target)?);
    }
    super::super::super::checkout_policy::receipt_versions(
        &serde_json::json!({"workspace":workspace}),
        versions
            .iter()
            .map(|version| (version, false)),
        None,
    )
}

impl super::Prepared {
    pub(in super::super) fn policy_input(&self) -> Option<&Value> {
        self.policy_input.as_ref()
    }

    pub(in super::super) fn complete_policy(&mut self, semver: Value) -> io::Result<Option<Value>> {
        self.policy
            .as_mut()
            .ok_or_else(|| invalid("inbound policy absent"))?
            .finish(semver)
    }

    pub(in super::super) fn validate_policy(&self) -> io::Result<()> {
        if let Some(policy) = &self.policy {
            policy.validate()?;
        }
        Ok(())
    }

    pub(in super::super) fn conflicts(&self, id: &str) -> Option<&[String]> {
        self.changes.conflicts.get(id).map(Vec::as_slice)
    }
}
