//! Keep callback source spools alive until identity publication and tooling finish.
use crate::commands::status::capture::Capture;
use serde_json::Value;
use std::{collections::HashMap, fs, io, path::Path};

#[derive(Default)]
pub(super) struct Retained {
    captures: Vec<Capture>,
    bytes: u64,
    rows: HashMap<String, Value>,
    started: bool,
    read_set: Vec<Value>,
    controls: HashMap<String, Value>,
    pub(super) facts: super::selectors::Facts,
}

impl Retained {
    pub(super) fn forget_loaded(&mut self) {
        // Keep source spool ownership and its aggregate budget across reloads.
        self.rows.clear();
        self.facts = super::selectors::Facts::default();
        self.started = false;
    }
    pub(super) fn start(&mut self) -> bool {
        let first = !self.started;
        self.started = true;
        first
    }
    pub(super) fn missing(&self, identities: &[String]) -> Vec<String> {
        identities
            .iter()
            .filter(|identity| !self.rows.contains_key(*identity))
            .cloned()
            .collect()
    }
    pub(super) fn rows(&self, identities: &[String]) -> io::Result<Vec<Value>> {
        identities
            .iter()
            .map(|identity| {
                self.rows
                    .get(identity)
                    .cloned()
                    .ok_or_else(|| io::Error::other("retained identity component missing"))
            })
            .collect()
    }
    pub(super) fn keep_controls(&mut self, proofs: &[Value]) -> io::Result<()> {
        for proof in proofs {
            let path = proof["path"]
                .as_str()
                .ok_or_else(|| io::Error::other("identity control proof path"))?;
            self.controls.insert(path.into(), proof.clone());
        }
        Ok(())
    }
    pub(super) fn add_proofs(&mut self, proofs: Vec<Value>) {
        self.read_set.extend(proofs);
    }
    pub(super) fn status(&mut self, compared: &Value, ids: &[String]) {
        for id in ids {
            let Some(row) = self.rows.get_mut(id) else { continue };
            row["modified"] = compared["comparisons"]
                .as_array()
                .and_then(|rows| {
                    rows.iter()
                        .find(|row| row["identity"] == *id)
                })
                .map_or(Value::Bool(false), |row| row["modified"].clone());
        }
    }
    pub(super) fn validate(&self) -> io::Result<()> {
        let mut reads = self.read_set.clone();
        reads.extend(self.controls.values().cloned());
        crate::commands::engine::Engine::new()?
            .validate_read_set(&reads, "identity component facts changed before publication")
    }
    pub(super) fn keep(&mut self, capture: Capture) -> io::Result<Vec<Value>> {
        self.read_set.extend(capture.dependency_read_set());
        self.facts.keep(&capture);
        self.keep_controls(super::controls::reads(&capture.environment_facts))?;
        let bytes = overlay_bytes(&capture)?;
        self.bytes = self.bytes
            .checked_add(bytes)
            .filter(|bytes| *bytes <= 96 * 1024 * 1024)
            .ok_or_else(|| io::Error::other("identity callback source budget"))?;
        let rows = capture.captured.clone();
        for row in &rows {
            let identity = row["identity"]
                .as_str()
                .ok_or_else(|| io::Error::other("retained component identity"))?;
            self.rows.insert(identity.into(), row.clone());
        }
        // Even unchanged callback sources carry a root descriptor which later
        // native comparisons validate. Its directory must outlive those facts.
        if rows
            .iter()
            .any(|row| row["sourceOverlayRoot"].is_string())
        {
            self.captures.push(capture);
        }
        Ok(rows)
    }
}

fn overlay_bytes(capture: &Capture) -> io::Result<u64> {
    let mut total = 0_u64;
    for row in &capture.captured {
        for path in row["sourceOverlays"]
            .as_object()
            .into_iter()
            .flat_map(|files| files.values())
        {
            let path =
                path.as_str().ok_or_else(|| io::Error::other("identity callback source path"))?;
            let root = row["sourceOverlayRoot"]
                .as_str()
                .ok_or_else(|| io::Error::other("identity callback source root"))?;
            let metadata = fs::symlink_metadata(path)?;
            if !Path::new(path).starts_with(root) || !metadata.is_file() {
                return Err(io::Error::other("identity callback source outside private spool"));
            }
            total = total
                .checked_add(metadata.len())
                .ok_or_else(|| io::Error::other("identity callback source budget"))?;
        }
    }
    Ok(total)
}
