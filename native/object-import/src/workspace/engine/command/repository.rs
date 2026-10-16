use super::super::dependency_graph::proof;
use crate::{checkout::repository, command_import, read_budget::Budget};
use serde_json::Value;
use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
};

pub(in crate::workspace::engine) struct Repository {
    directory: PathBuf,
    imported: Option<command_import::PreparedImport>,
    raw: Budget,
    packed: Budget,
    values: HashMap<(String, String), Value>,
    proofs: Vec<proof::Proof>,
}
impl Repository {
    pub(in crate::workspace::engine) fn new(
        root: &Path,
        imported: Option<command_import::PreparedImport>,
    ) -> Self {
        Self {
            directory: crate::scope_path(root).join("objects"),
            imported,
            raw: Budget::new(32 * 1024 * 1024),
            packed: Budget::new(32 * 1024 * 1024),
            values: HashMap::new(),
            proofs: Vec::new(),
        }
    }
    pub(in crate::workspace::engine) fn read(
        &mut self,
        reference: &str,
        kind: &str,
    ) -> io::Result<Value> {
        let hash = crate::merge_history::hash(reference)?;
        if let Some(imported) = &self.imported
            && let Some(value) = imported.overlay.read(reference, kind)?
        {
            return Ok(value.clone());
        }
        let key = (reference.to_owned(), kind.to_owned());
        if let Some(value) = self.values.get(&key) {
            return Ok(value.clone());
        }
        let file = self.directory
            .join(&reference[..2])
            .join(&reference[2..]);
        proof::read(&file, &mut self.proofs)?;
        let bytes = repository::read_shared(&self.directory, hash, &self.raw, &self.packed)?;
        let (_, body) = repository::split(&bytes, hash, kind)?;
        let value: Value = serde_json::from_slice(body).map_err(io::Error::other)?;
        proof::verify(&self.proofs[self.proofs.len() - 1..])?;
        self.values.insert(key, value.clone());
        Ok(value)
    }
    pub(in crate::workspace::engine) fn read_set(&self) -> &[proof::Proof] {
        &self.proofs
    }
    pub(super) fn source_batch(&mut self, references: &[String]) -> io::Result<Vec<Vec<u8>>> {
        use rayon::prelude::*;
        if references.len() > 4096 || self.proofs.len() + references.len() > 16384 {
            return Err(super::super::invalid("hidden Source batch budget"));
        }
        let records = references
            .par_iter()
            .map(|reference| {
                let hash = crate::merge_history::hash(reference)?;
                if let Some(source) = self.imported
                    .as_ref()
                    .and_then(|imported| imported.overlay.source(reference))
                {
                    self.raw.reserve(source.len())?;
                    return Ok((source.to_vec(), None));
                }
                let record =
                    repository::read_source_shared(&self.directory, hash, &self.raw, &self.packed)?;
                let path = self.directory
                    .join(&reference[..2])
                    .join(&reference[2..]);
                Ok((record.body, Some(proof::content(&path, &record.compressed))))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let start = self.proofs.len();
        let mut contents = Vec::with_capacity(records.len());
        for (bytes, receipt) in records {
            if let Some(receipt) = receipt {
                self.proofs.push(receipt);
            }
            contents.push(bytes);
        }
        proof::verify(&self.proofs[start..])?;
        Ok(contents)
    }
    pub(in crate::workspace::engine) fn source_json(
        &mut self,
        reference: &str,
    ) -> io::Result<Value> {
        crate::merge_history::hash(reference)?;
        if let Some(source) = self.imported
            .as_ref()
            .and_then(|imported| imported.overlay.source(reference))
        {
            if source.len() > 4 * 1024 * 1024 {
                return Err(super::super::invalid("command graph source byte budget"));
            }
            return serde_json::from_slice(source).map_err(io::Error::other);
        }
        self.read(reference, "Source")
    }
    pub(super) fn accept_recovery_staged(
        &mut self,
        root: &Path,
        bytes: Option<&[u8]>,
    ) -> io::Result<()> {
        if let Some(imported) = &mut self.imported {
            imported.accept_recovery_staged(root, bytes)?;
        }
        Ok(())
    }
    pub(in crate::workspace::engine) fn validate(&self) -> io::Result<()> {
        if let Some(imported) = &self.imported {
            imported.validate()?;
        }
        proof::verify(&self.proofs)
    }
    pub(super) fn remote_head(&mut self, identity: &str) -> io::Result<Option<String>> {
        let (scope, name) = identity
            .split_once('/')
            .ok_or_else(|| super::super::invalid("command remote identity"))?;
        if scope.is_empty()
            || matches!(scope, "." | "..")
            || scope
                .bytes()
                .any(|byte| !byte.is_ascii_alphanumeric() && !b"._-".contains(&byte))
        {
            return Err(super::super::invalid("command remote scope"));
        }
        let rows = self.remote_rows(scope)?;
        if rows.len() > 4096 {
            return Err(super::super::invalid("command remote row limit"));
        }
        for row in rows {
            let head =
                row["head"].as_str().ok_or_else(|| super::super::invalid("command remote head"))?;
            crate::merge_history::hash(head)?;
            if row["id"]["scope"] == scope && row["id"]["name"] == name {
                return Ok(Some(head.to_owned()));
            }
        }
        Ok(None)
    }
    fn remote_rows(&mut self, scope: &str) -> io::Result<Vec<Value>> {
        if let Some(rows) = self
            .overlay()
            .and_then(|overlay| overlay.refs(scope))
        {
            Ok(rows.to_vec())
        } else {
            let file = self.directory
                .parent()
                .ok_or_else(|| super::super::invalid("command scope path"))?
                .join("refs/remotes")
                .join(scope)
                .join("main");
            let bytes = proof::read(&file, &mut self.proofs)?;
            Ok(match bytes {
                Some(bytes) => {
                    serde_json::from_slice::<Vec<Value>>(&bytes).map_err(io::Error::other)?
                }
                None => Vec::new(),
            })
        }
    }
    pub(super) fn overlay(&self) -> Option<&command_import::Overlay> {
        self.imported.as_ref().map(|imported| &imported.overlay)
    }
    pub(super) fn prepare_versions(
        &mut self,
        targets: &[command_import::Target],
    ) -> io::Result<()> {
        if let Some(imported) = &mut self.imported {
            imported.prepare_versions(targets)?;
        }
        Ok(())
    }
    pub(super) fn prepare_merge_gap(
        &mut self,
        targets: &[command_import::Target],
    ) -> io::Result<()> {
        if let Some(imported) = &mut self.imported {
            imported.prepare_merge_gap(targets)?;
        }
        Ok(())
    }
    pub(super) fn prepare_lane_pattern_versions(
        &mut self,
        targets: &[command_import::Target],
    ) -> io::Result<()> {
        if let Some(imported) = &mut self.imported {
            imported.prepare_lane_pattern_versions(targets)?;
        }
        Ok(())
    }
    pub(super) fn prepare_lane_artifacts(&mut self, versions: &[String]) -> io::Result<()> {
        self.imported
            .as_mut()
            .ok_or_else(|| super::super::invalid("lane import owner absent"))?
            .prepare_lane_artifacts(versions)
    }
    pub(super) fn prepare_lane_squash_messages(
        &mut self,
        scope: &str,
        hashes: &[String],
    ) -> io::Result<()> {
        self.prepare_lane_objects(scope, hashes, "Version", None)
    }
    pub(super) fn prepare_lane_objects(
        &mut self,
        scope: &str,
        hashes: &[String],
        kind: &str,
        reason: Option<&str>,
    ) -> io::Result<()> {
        self.imported
            .as_mut()
            .ok_or_else(|| super::super::invalid("lane import owner absent"))?
            .prepare_lane_objects(scope, hashes, kind, reason)
    }
    pub(super) fn prepare_lane_referenced(
        &mut self,
        scope: &str,
        heads: &[(String, Value)],
    ) -> io::Result<()> {
        self.imported
            .as_mut()
            .ok_or_else(|| super::super::invalid("lane import owner absent"))?
            .prepare_lane_referenced(scope, heads)
    }
    pub(super) fn imported_index(&self) -> Option<&Value> {
        self.imported.as_ref().map(command_import::PreparedImport::planned_index)
    }
    pub(super) fn progress(&self) -> Value {
        let Some(imported) = &self.imported else {
            return serde_json::json!({"bitmapCount":0,"imports":[]});
        };
        serde_json::json!({"bitmapCount":imported.bitmap_count,"imports":imported.progress.iter().map(|progress| {
            let mut row = serde_json::json!({"reason":progress.reason,"ids":progress.ids,"components":progress.components.len(),"objects":progress.objects.len()});
            if progress.object_request { row["objectRequest"] = serde_json::json!(true); }
            row
        }).collect::<Vec<_>>()})
    }
    pub(super) fn complete_lane_histories(
        &mut self,
        histories: Vec<(String, Value)>,
    ) -> io::Result<()> {
        if let Some(imported) = &mut self.imported {
            imported.complete_lane_histories(histories)
        } else if histories.is_empty() {
            Ok(())
        } else {
            Err(super::super::invalid("command lane import owner missing"))
        }
    }
    pub(super) fn commit_import(&self) -> io::Result<()> {
        if let Some(imported) = &self.imported {
            imported.commit()?;
        }
        Ok(())
    }
}

pub(super) fn model(context: &Value, identity: &str) -> io::Result<Option<Value>> {
    Ok(context["models"]
        .as_array()
        .ok_or_else(|| super::super::invalid("command models"))?
        .iter()
        .find(|model| {
            format!(
                "{}/{}",
                model["scope"].as_str().unwrap_or_default(),
                model["name"].as_str().unwrap_or_default(),
            ) == identity
        })
        .cloned())
}
