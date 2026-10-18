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
}

impl Retained {
    pub(super) fn forget_loaded(&mut self) {
        // Keep source spools alive and keep their aggregate byte budget, while
        // matching Workspace._reloadConsumer's loaded-class invalidation.
        self.rows.clear();
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
    pub(super) fn keep(&mut self, capture: Capture) -> io::Result<Vec<Value>> {
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
        if rows
            .iter()
            .any(|row| {
                row["sourceOverlays"]
                    .as_object()
                    .is_some_and(|files| !files.is_empty())
            })
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
