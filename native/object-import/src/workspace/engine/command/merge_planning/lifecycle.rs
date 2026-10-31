use super::{super::bitmap, Finalized, Prepared, Record, invalid, merge, proof};
use serde_json::{Value, json};
use std::{fs, io, path::Path};
impl Prepared {
    pub(in crate::workspace::engine::command) fn snapshot_versions(&self) -> &[Value] {
        self.finalized
            .as_ref()
            .map_or(&[], |finalized| finalized.snapshot.versions.as_slice())
    }
    pub(in crate::workspace::engine::command) fn lane_receipt(&self) -> Option<Value> {
        self.publication.lane.as_ref().map(super::super::lane_publication::Prepared::receipt)
    }
    pub(in crate::workspace::engine::command) fn rebased(&self) -> Vec<(String, String, Value)> {
        self.publication.lane
            .as_ref()
            .map_or_else(Vec::new, super::super::lane_publication::Prepared::rebased)
    }
    pub(in crate::workspace::engine::command) fn finalize_lane(
        &mut self,
        staging: &Path,
        receipt: &Value,
    ) -> io::Result<Vec<(String, Value)>> {
        self.publication.lane
            .as_mut()
            .ok_or_else(|| invalid("command lane missing"))?
            .finalize(staging, receipt)
    }
    pub(in crate::workspace::engine::command) fn commit_recovery(&self) -> io::Result<()> {
        if let Some(lane) = &self.publication.lane {
            lane.commit_recovery()?;
        }
        Ok(())
    }
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
        for row in policy.rows.iter().filter(|row| !row.fast_forward) {
            let index = policy_material(&self.pending, &self.materials, &row.identity)?;
            self.materials[index].version = row.projected.clone();
            if !row.ours_conflict {
                self.unmerged[index]["mergedConfig"] = row.merged.clone();
            }
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn defer_snapshot(
        &mut self,
    ) -> io::Result<Vec<String>> {
        if self.finalized.is_some() {
            return Err(invalid("command merge snapshot already finalized"));
        }
        let identities = self.pending
            .iter()
            .map(|row| row.identity.clone())
            .collect();
        self.pending.clear();
        Ok(identities)
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
            .filter(|material| {
                !material.hidden && !material.no_write() && !self.is_removed(&material.output)
            })
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
    fn is_removed(&self, output: &Value) -> bool {
        output["id"]
            .as_str()
            .and_then(|id| id.rsplit_once('@'))
            .is_some_and(|(identity, _)| {
                self.publication.removed
                    .iter()
                    .any(|row| row.identity == identity)
            })
    }
    pub(in crate::workspace::engine::command) fn removed_ids(&self) -> Vec<String> {
        self.publication.removed
            .iter()
            .map(|row| row.identity.clone())
            .collect()
    }
    pub(in crate::workspace::engine::command) fn removed_snap_ids(
        &self,
    ) -> io::Result<Vec<String>> {
        let versions = &self.finalized
            .as_ref()
            .ok_or_else(|| invalid("command removed snap absent"))?
            .snapshot
            .versions;
        self.publication.removed
            .iter()
            .map(|row| {
                let hash = versions
                    .iter()
                    .find(|version| version["identity"] == row.identity)
                    .and_then(|version| version["hash"].as_str())
                    .ok_or_else(|| invalid("command removed snap reference"))?;
                Ok(format!("{}@{hash}", row.identity))
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
                lane: record.context.get("lane"),
            })
            .collect::<Vec<_>>();
        let message = record.request.options.message
            .as_deref()
            .filter(|message| !message.is_empty())
            .unwrap_or("");
        let snapshot =
            merge::snapshot::prepare(&record.request.root, staging, &inputs, receipt, message)?;
        let files = self.prepare_packages(record, &snapshot)?;
        if let Some(lane) = &mut self.publication.lane {
            lane.finalize_snap(staging, &snapshot.versions, receipt, message)?;
        }
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
                    directory: if self.publication.removed
                        .iter()
                        .any(|row| row.identity == input.identity)
                    {
                        ""
                    } else {
                        &input.directory
                    },
                    hash: version["hash"]
                        .as_str()
                        .ok_or_else(|| invalid("command snap final reference"))?,
                    semantic_version: None,
                    version: &version["version"],
                })
            })
            .collect::<io::Result<Vec<_>>>()?;
        let roots = record.context["workspace"]
            .as_object()
            .and_then(|map| {
                map.iter()
                    .find_map(|(key, val)| {
                        (key == "teambit.dependencies/dependency-resolver"
                            || key.starts_with("teambit.dependencies/dependency-resolver@"))
                        .then_some(val)
                    })
            })
            .and_then(|resolver| resolver["rootComponents"].as_bool())
            .unwrap_or(false);
        let mut prepared = merge::finalization::prepare(&record.request.root, &inputs, roots, &[])?;
        prepared.imported_index(&record.request.root, record.repository.imported_index())?;
        Ok(prepared)
    }
    pub(in crate::workspace::engine::command) fn snap_updates(
        &self,
    ) -> io::Result<Vec<bitmap::Update>> {
        let snapshot =
            &self.finalized.as_ref().ok_or_else(|| invalid("command snap not finalized"))?.snapshot;
        snapshot.versions
            .iter()
            .filter(|version| {
                !self.publication.removed
                    .iter()
                    .any(|row| version["identity"] == row.identity)
                    && self.pending
                        .iter()
                        .any(|pending| {
                            !pending.directory.is_empty() && version["identity"] == pending.identity
                        })
            })
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
    pub(in crate::workspace::engine::command) fn persist_first(
        &mut self,
        root: &Path,
    ) -> io::Result<usize> {
        if let Some(policy) = &self.policy {
            policy.commit_configs()?;
        }
        if let Some(models) = &mut self.publication.fast_forward {
            models.commit(root)?;
        }
        if let Some(lane) = &mut self.publication.lane {
            lane.commit_first(root)?;
        }
        if !self.materials.is_empty() {
            fs::write(
                crate::scope_path(root).join("unmerged.json"),
                serde_json::to_vec_pretty(&self.unmerged).map_err(io::Error::other)?,
            )?;
        }
        Ok(super::super::apply_command::notify(root))
    }
    pub(in crate::workspace::engine::command) fn finish_snap(
        &mut self,
        root: &Path,
    ) -> io::Result<usize> {
        let mut notifications = 0;
        if let Some(finalized) = &mut self.finalized {
            finalized.snapshot.commit(root)?;
            if let Some(lane) = &mut self.publication.lane {
                lane.commit_second(root)?;
            }
            notifications += super::super::apply_command::notify(root);
            finalized.files.commit()?;
            fs::write(crate::scope_path(root).join("unmerged.json"), b"[]")?;
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
        if let Some(lane) = &self.publication.lane {
            lane.validate()?;
        }
        if let Some(models) = &self.publication.fast_forward {
            models.validate()?;
        }
        if let Some(finalized) = &self.finalized {
            finalized.snapshot.validate()?;
            finalized.files.validate()?;
        }
        self.validate_materials(root)?;
        super::removal::validate(root, &self.publication.removed)?;
        if crate::scope_path(root).join("unmerged.json").is_symlink() {
            return Err(invalid("command unmerged symlink"));
        }
        Ok(())
    }
    fn validate_materials(&self, root: &Path) -> io::Result<()> {
        for material in &self.materials {
            material.validate(root)?;
            for file in &material.files {
                let path =
                    file["relativePath"].as_str().ok_or_else(|| invalid("command merge path"))?;
                crate::checkout::plan::relative_path(path)?;
            }
        }
        Ok(())
    }
    pub(in crate::workspace::engine::command) fn remove(&self, root: &Path) -> io::Result<()> {
        for material in &self.materials {
            if !self.is_removed(&material.output) {
                material.remove()?;
            }
        }
        super::removal::remove(root, &self.publication.removed)
    }
    pub(in crate::workspace::engine::command) fn write(&mut self) -> io::Result<()> {
        for material in &self.materials {
            if !self.is_removed(&material.output) {
                material.write(&mut self.state)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;

fn policy_material(
    pending: &[super::Pending],
    materials: &[merge::Prepared],
    identity: &str,
) -> io::Result<usize> {
    pending
        .iter()
        .position(|row| row.identity == identity)
        .or_else(|| {
            materials
                .iter()
                .position(|material| {
                    material.output["id"]
                        .as_str()
                        .and_then(|id| id.rsplit_once('@'))
                        .is_some_and(|(id, _)| id == identity)
                })
        })
        .ok_or_else(|| invalid("command policy material absent"))
}
