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
        self.changes.relocation.validate()?;
        if let Some(policy) = &self.policy {
            policy.validate()?;
        }
        Ok(())
    }

    pub(in super::super) fn conflicts(&self, id: &str) -> Option<&[String]> {
        self.changes.conflicts.get(id).map(Vec::as_slice)
    }
}

impl super::Prepared {
    pub(in super::super) fn requires_dependencies(&self) -> bool {
        self.write_deps.is_some()
    }
    pub(in super::super) fn dependency_target(&self) -> io::Result<&str> {
        self.write_deps.as_deref().ok_or_else(|| invalid("inbound dependency target absent"))
    }
    pub(in super::super) fn root(&self) -> &Path {
        &self.root
    }
    pub(in super::super) fn refresh_policy(
        &mut self,
        targets: &[super::Target],
        imported: &mut crate::command_import::PreparedImport,
    ) -> io::Result<()> {
        self.policy_input = receipt(&self.root, targets, imported)?;
        self.policy = self.policy_input
            .as_ref()
            .map(|input| {
                super::super::super::checkout_policy::Prepared::new(&self.root, input.clone())
            })
            .transpose()?;
        self.write_deps = None;
        Ok(())
    }
    pub(in super::super) fn commit_policy(&self) -> io::Result<()> {
        if let Some(policy) = &self.policy {
            policy.commit()?;
        }
        Ok(())
    }
}

impl super::Prepared {
    pub(in super::super) fn published_bitmap_proof(&self) -> io::Result<Value> {
        let path = self.root.join(".bitmap");
        if std::fs::read(&path)? != self.bitmap_after {
            return Err(invalid("inbound published bitmap changed"));
        }
        serde_json::to_value(super::super::super::proof::content(&path, &self.bitmap_after))
            .map_err(io::Error::other)
    }
}

impl super::Prepared {
    pub(in super::super) fn published_write_receipts(&self) -> io::Result<Vec<Value>> {
        let mut writes = Vec::new();
        for (path, after) in &self.changes.additions {
            Self::write_receipt(&mut writes, path, None, after)?;
        }
        for replacement in &self.changes.replacements {
            Self::write_receipt(
                &mut writes,
                &replacement.path,
                Some(&replacement.before),
                &replacement.after,
            )?;
        }
        Self::write_receipt(
            &mut writes,
            &self.root.join(".bitmap"),
            Some(&self.bitmap_before),
            &self.bitmap_after,
        )?;
        Ok(writes)
    }
    fn write_receipt(
        writes: &mut Vec<Value>,
        path: &Path,
        before: Option<&[u8]>,
        after: &[u8],
    ) -> io::Result<()> {
        let actual =
            crate::read_budget::Budget::new(32 * 1024 * 1024).read(std::fs::File::open(path)?)?;
        if actual != after {
            return Err(invalid("inbound owned file changed after publication"));
        }
        writes.push(crate::command_import::write_receipt(path, before, after));
        Ok(())
    }
}

impl super::Prepared {
    pub(in super::super) fn history_file_id(&self) -> &str {
        &self.history.file_id
    }
}

impl super::Prepared {
    pub(in super::super) fn component_order(&self) -> &[String] {
        &self.changes.component_order
    }
}
