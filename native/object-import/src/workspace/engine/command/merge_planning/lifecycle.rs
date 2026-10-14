use super::{super::bitmap, Finalized, Prepared, Record, invalid, merge, proof};
use serde_json::{Value, json};
use std::{fs, io, path::Path};
impl Prepared {
    pub(in crate::workspace::engine::command) fn validate_policy_final(
        &mut self,
        record: &Record,
        targets: &[super::super::materialization::Prepared],
        captured: &[super::super::capture::Captured],
    ) -> io::Result<()> {
        super::preflight::validate(record, self, targets, captured)
    }

    pub(in crate::workspace::engine::command) fn apply_policy_configs(&mut self) -> io::Result<()> {
        let policy = self.policy.as_ref().ok_or_else(|| invalid("command policy missing"))?;
        for (index, row) in policy.rows
            .iter()
            .filter(|row| !row.fast_forward)
            .enumerate()
        {
            self.materials[index].version = row.projected.clone();
            if !row.ours_conflict {
                self.unmerged[index]["mergedConfig"] = row.merged.clone();
            }
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn cancel_snap(&mut self) {
        self.pending.clear();
    }
    pub(in crate::workspace::engine::command) fn needs_snap(&self) -> Option<Vec<String>> {
        if self.pending.is_empty() || self.finalized.is_some() {
            None
        } else {
            Some(
                self.pending
                    .iter()
                    .map(|input| input.identity.clone())
                    .collect(),
            )
        }
    }
    pub(in crate::workspace::engine::command) fn bitmap_updates(
        &self,
    ) -> io::Result<Vec<bitmap::Update>> {
        self.materials
            .iter()
            .filter(|material| !material.no_write())
            .map(|material| {
                let (identity, _) = material.output["id"]
                    .as_str()
                    .and_then(|id| id.rsplit_once('@'))
                    .ok_or_else(|| invalid("command merge bitmap identity"))?;
                Ok(bitmap::Update {
                    identity: identity.to_owned(),
                    version: material.version_name.clone(),
                    main_file: material.version["mainFile"]
                        .as_str()
                        .ok_or_else(|| invalid("command merge main file"))?
                        .to_owned(),
                    keep_ours: false,
                })
            })
            .collect()
    }
    pub(in crate::workspace::engine::command) fn finalize(
        &mut self,
        record: &Record,
        staging: &Path,
        receipt: &Value,
    ) -> io::Result<Value> {
        if let Some(policy) = &self.policy {
            policy.validate(true)?;
        }
        if self.needs_snap().is_none() {
            return Err(invalid("command unexpected snap receipt"));
        }
        let inputs = self.pending
            .iter()
            .zip(&self.materials)
            .map(|(input, material)| merge::snapshot::Input {
                identity: &input.identity,
                model: &input.model,
                material,
                remote: &input.remote,
            })
            .collect::<Vec<_>>();
        let message = record.request.options.message
            .as_deref()
            .filter(|message| !message.is_empty())
            .unwrap_or("");
        let snapshot =
            merge::snapshot::prepare(&record.request.root, staging, &inputs, receipt, message)?;
        let files = self.prepare_packages(record, &snapshot)?;
        let results = json!({"snappedComponents":snapshot.versions.iter().map(|version|
            json!({"id":format!("{}@{}",version["identity"].as_str().unwrap(),version["hash"].as_str().unwrap())})).collect::<Vec<_>>(),"autoSnappedResults":[]});
        self.finalized = Some(Finalized { snapshot, files });
        Ok(results)
    }
    fn prepare_packages(
        &self,
        record: &Record,
        snapshot: &merge::snapshot::Snapshot,
    ) -> io::Result<merge::finalization::Prepared> {
        let inputs = self.pending
            .iter()
            .zip(&snapshot.versions)
            .map(|(input, version)| {
                Ok(merge::finalization::Input {
                    identity: &input.identity,
                    directory: &input.directory,
                    hash: version["hash"]
                        .as_str()
                        .ok_or_else(|| invalid("command snap final reference"))?,
                    version: &version["version"],
                })
            })
            .collect::<io::Result<Vec<_>>>()?;
        let roots = record.context["workspace"]["teambit.dependencies/dependency-resolver"]["rootComponents"].as_bool().unwrap_or(false);
        merge::finalization::prepare(&record.request.root, &inputs, roots)
    }
    pub(in crate::workspace::engine::command) fn snap_updates(
        &self,
    ) -> io::Result<Vec<bitmap::Update>> {
        let snapshot =
            &self.finalized.as_ref().ok_or_else(|| invalid("command snap not finalized"))?.snapshot;
        snapshot.versions
            .iter()
            .map(|version| {
                Ok(bitmap::Update {
                    identity: version["identity"]
                        .as_str()
                        .ok_or_else(|| invalid("command snapped identity"))?
                        .to_owned(),
                    version: version["hash"]
                        .as_str()
                        .ok_or_else(|| invalid("command snapped hash"))?
                        .to_owned(),
                    main_file: version["version"]["mainFile"]
                        .as_str()
                        .ok_or_else(|| invalid("command snapped main file"))?
                        .to_owned(),
                    keep_ours: true,
                })
            })
            .collect()
    }
    pub(in crate::workspace::engine::command) fn finish_snap(
        &mut self,
        root: &Path,
    ) -> io::Result<usize> {
        if let Some(models) = &mut self.fast_forward {
            models.commit(root)?;
        }
        if !self.materials.is_empty() {
            fs::write(
                root.join(".bit/unmerged.json"),
                serde_json::to_vec_pretty(&self.unmerged).map_err(io::Error::other)?,
            )?;
        }
        let mut notifications = super::super::apply_command::notify(root);
        if let Some(finalized) = &mut self.finalized {
            finalized.snapshot.commit(root)?;
            notifications += super::super::apply_command::notify(root);
            finalized.files.commit()?;
            fs::write(root.join(".bit/unmerged.json"), b"[]")?;
        }
        Ok(notifications)
    }

    pub(in crate::workspace::engine::command) fn validate(&self, root: &Path) -> io::Result<()> {
        if let Some(policy) = &self.policy {
            policy.validate(!self.pending.is_empty())?;
        }
        if self.needs_snap().is_some() {
            return Err(invalid("command snap receipt required before apply"));
        }
        proof::verify(&self.proofs)?;
        if let Some(models) = &self.fast_forward {
            models.validate()?;
        }
        if let Some(finalized) = &self.finalized {
            finalized.snapshot.validate()?;
            finalized.files.validate()?;
        }
        for material in &self.materials {
            material.validate(root)?;
            for file in &material.files {
                let path =
                    file["relativePath"].as_str().ok_or_else(|| invalid("command merge path"))?;
                crate::checkout::plan::relative_path(path)?;
            }
        }
        if root.join(".bit/unmerged.json").is_symlink() {
            return Err(invalid("command unmerged symlink"));
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn remove(&self) -> io::Result<()> {
        for material in &self.materials {
            material.remove()?;
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn write(&mut self) -> io::Result<()> {
        for material in &self.materials {
            material.write(&mut self.state)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
