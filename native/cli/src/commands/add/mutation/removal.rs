//! Legacy status loads share component classes and comparisons with earlier selectors.
use super::{ProjectedLinker, load};
use crate::commands::{engine::Engine, workspace_command};
use serde_json::{Value, json};
use std::{io, path::Path};
impl ProjectedLinker {
    pub(in crate::commands) fn capture_consumers(
        &mut self,
        root: &Path,
        bitmap: &Value,
        ids: &[String],
    ) -> io::Result<Vec<Value>> {
        let result = self.consumer_status(root, bitmap, ids);
        self.finish(result)
    }
    fn consumer_status(
        &mut self,
        root: &Path,
        bitmap: &Value,
        ids: &[String],
    ) -> io::Result<Vec<Value>> {
        let normalized = normalize_ids(ids);
        let ids = normalized.as_slice();
        let missing = self.retained.missing(ids);
        if !missing.is_empty() {
            let capture = load::capture_consumer(
                root,
                bitmap,
                &missing,
                &mut self.environment,
                &mut self.stdout,
            )?;
            self.retained.start();
            self.retained.keep(capture)?;
        }
        let unchecked = unchecked_ids(&self.retained.rows(ids)?);
        if !unchecked.is_empty() {
            let mut engine = Engine::new()?;
            let context = engine.request(&json!({"kind":"trackingContext","root":root,
                "home":workspace_command::home(),"bitmap":bitmap}))?;
            self.compare_status(&mut engine, root, &context, &unchecked)?;
        }
        self.retained.rows(ids)
    }
}

fn normalize_ids(ids: &[String]) -> Vec<String> {
    ids.iter()
        .map(|id| {
            let trimmed = id.trim();
            trimmed
                .rsplit_once('@')
                .map_or(trimmed, |(base, _)| base.trim())
                .to_owned()
        })
        .filter(|id| !id.is_empty())
        .collect()
}

fn unchecked_ids(rows: &[Value]) -> Vec<String> {
    rows.iter()
        .filter(|row| !row["modified"].is_boolean())
        .filter_map(|row| {
            row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(|id| {
                    id.rsplit_once('@')
                        .map_or(id, |(base, _)| base.trim())
                        .to_owned()
                })
        })
        .collect()
}
