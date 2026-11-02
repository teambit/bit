//! Callback-visible aspect configuration refinement ([`refresh`], [`remove_extension_config`]) for workspace-loaded recovery [`Batch`] items.
use super::{Action, Batch, REMOVE, Value, configuration, invalid, selection};
use std::io;

/// Refines recovery actions and `component.json` edits using loaded workspace aspect receipts.
pub(super) fn refresh(batch: &mut Batch, rows: &[Value]) -> io::Result<()> {
    let mut items = std::mem::take(&mut batch.items);
    for item in &mut items {
        if item.key.is_none() || !matches!(item.action, Action::None | Action::UpdateConfig) {
            continue;
        }
        let identity = selection::bare(&item.id);
        let row = rows
            .iter()
            .find(|row| row_matches_identity(row, identity))
            .ok_or_else(|| invalid("recovery loaded component receipt missing"))?;
        let extensions = row["current"]["extensions"]
            .as_array()
            .ok_or_else(|| invalid("recovery loaded aspect receipt"))?;
        if let Some(config) = remove_extension_config(extensions) {
            item.action = if super::classification::has_remove_info(config) {
                Action::UpdateConfig
            } else {
                Action::None
            };
        }
        item.configuration = configuration::prepare(batch, item)?;
    }
    batch.items = items;
    Ok(())
}

/// Return `true` when a loaded component receipt `row` matches `identity` without version.
#[inline]
fn row_matches_identity(row: &Value, identity: &str) -> bool {
    row["identity"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .or_else(|| {
            row["id"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())
        })
        .is_some_and(|raw| selection::bare(raw) == identity)
}

/// Look up the effective [`REMOVE`] aspect configuration or data in `extensions`.
#[inline]
fn remove_extension_config(extensions: &[Value]) -> Option<&Value> {
    extensions
        .iter()
        .find(|row| {
            crate::workspace::engine::client_status::config::is_extension_aspect(row, REMOVE)
        })
        .map(|row| {
            if row["config"].as_object().is_none_or(serde_json::Map::is_empty)
                && row["data"].is_object()
            {
                &row["data"]
            } else {
                &row["config"]
            }
        })
}
