//! Legacy status loads on [`ProjectedLinker`] share component classes and comparisons with earlier selectors.
//!
//! Implements `capture_consumers` via [`normalize_ids`] and [`unchecked_ids`] for component removal and deprecation status checks.
use super::{ProjectedLinker, load};
use crate::commands::{engine::Engine, workspace_command};
use serde_json::{Value, json};
use std::{io, path::Path};
impl ProjectedLinker {
    /// Captures consumer status rows for `ids` against the projected `bitmap` via [`Self::consumer_status`].
    #[inline]
    pub(in crate::commands) fn capture_consumers(
        &mut self,
        root: &Path,
        bitmap: &Value,
        ids: &[String],
    ) -> io::Result<Vec<Value>> {
        let result = self.consumer_status(root, bitmap, ids);
        self.finish(result)
    }
    /// Loads missing consumer components and compares status for `ids` against `bitmap`.
    fn consumer_status(
        &mut self,
        root: &Path,
        bitmap: &Value,
        ids: &[String],
    ) -> io::Result<Vec<Value>> {
        if !root.is_absolute()
            || root
                .as_os_str()
                .as_encoded_bytes()
                .iter()
                .all(u8::is_ascii_whitespace)
        {
            return Err(io::Error::other("consumer status workspace root is empty"));
        }
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

/// Strips `@version` suffixes and deduplicates non-empty component `ids` while preserving first-seen order.
#[inline]
fn normalize_ids(ids: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::with_capacity(ids.len());
    ids.iter()
        .map(|id| {
            let trimmed = id.trim();
            trimmed.rsplit_once('@').map_or(trimmed, |(base, _)| base.trim())
        })
        .filter(|id| !id.is_empty() && seen.insert(*id))
        .map(str::to_owned)
        .collect()
}

/// Collects bare component identities from `rows` whose `modified` boolean has not yet been computed.
#[inline]
fn unchecked_ids(rows: &[Value]) -> Vec<String> {
    rows.iter()
        .filter(|row| !row["modified"].is_boolean())
        .filter_map(|row| {
            row["identity"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .or_else(|| {
                    row["id"]
                        .as_str()
                        .map(str::trim)
                        .filter(|id| !id.is_empty())
                })
                .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
                .filter(|id| !id.is_empty())
                .map(str::to_owned)
        })
        .collect()
}
