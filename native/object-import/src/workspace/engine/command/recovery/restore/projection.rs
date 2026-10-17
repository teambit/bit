use super::{Prepared, invalid, proof};
use std::{collections::BTreeMap, io, path::PathBuf};

pub(in super::super) struct Controls {
    expected: BTreeMap<PathBuf, Option<Vec<u8>>>,
    backup: PathBuf,
    removals: Vec<PathBuf>,
}
impl Prepared {
    pub(in super::super) fn validate_dependencies(&self, rows: &[proof::Proof]) -> io::Result<()> {
        let backup = crate::scope_path(&self.root).join("last-merged");
        for row in rows {
            if row.path.starts_with(&backup)
                || self.mutations.removals
                    .iter()
                    .any(|path| row.path.starts_with(path))
            {
                return Err(invalid("recovery dependency references removed path"));
            }
        }
        Ok(())
    }
    pub(in super::super) fn controls(&self) -> Controls {
        let mut expected = BTreeMap::from([
            (self.root.join(".bitmap"), Some(self.bitmap.clone())),
            (self.root.join("workspace.jsonc"), Some(self.workspace.clone())),
            (crate::scope_path(&self.root).join("unmerged.json"), Some(b"[]".to_vec())),
            (self.root.join("merge-conflict"), None),
        ]);
        for ((_, destination), bytes) in
            self.mutations.staged.iter().zip(&self.mutations.staged_bytes)
        {
            expected.insert(destination.clone(), bytes.clone());
        }
        Controls {
            expected,
            backup: crate::scope_path(&self.root).join("last-merged"),
            removals: self.mutations.removals.clone(),
        }
    }
}
impl Controls {
    pub(in super::super) fn validate(&self, rows: &[proof::Proof]) -> io::Result<()> {
        for row in rows {
            if self.expected.contains_key(&row.path)
                || row.path.starts_with(&self.backup)
                || self.removals
                    .iter()
                    .any(|path| row.path.starts_with(path))
            {
                proof::validate_restored_control(row)?;
            }
        }
        Ok(())
    }
    pub(in super::super) fn paths(&self) -> Vec<PathBuf> {
        self.expected.keys().cloned().collect()
    }
    pub(in super::super) fn project(
        &self,
        rows: &[proof::Proof],
        internal: bool,
    ) -> io::Result<Vec<proof::Proof>> {
        let output = rows
            .iter()
            .map(|row| {
                if let Some(expected) = self.expected.get(&row.path) {
                    return proof::restored_control(row, expected.as_deref());
                }
                if internal
                    && (row.path.starts_with(&self.backup)
                        || self.removals
                            .iter()
                            .any(|path| row.path.starts_with(path)))
                {
                    return proof::restored_control(row, None);
                }
                Ok(row.clone())
            })
            .collect::<io::Result<Vec<_>>>()?;
        proof::verify(&output)?;
        Ok(output)
    }
}
