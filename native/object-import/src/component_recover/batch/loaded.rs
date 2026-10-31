//! Only callback-visible aspect configuration refines workspace-loaded classifications.
use super::{Action, Batch, REMOVE, Value, configuration, invalid, selection};
use std::io;

pub(super) fn refresh(batch: &mut Batch, rows: &[Value]) -> io::Result<()> {
    let mut items = std::mem::take(&mut batch.items);
    for item in &mut items {
        if item.key.is_none() || !matches!(item.action, Action::None | Action::UpdateConfig) {
            continue;
        }
        let identity = selection::bare(&item.id);
        let row = rows
            .iter()
            .find(|row| {
                row["identity"]
                    .as_str()
                    .or_else(|| row["id"].as_str())
                    .map_or("", str::trim)
                    == identity
            })
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

fn remove_extension_config(extensions: &[Value]) -> Option<&Value> {
    extensions
        .iter()
        .find(|row| {
            crate::workspace::engine::client_status::config::is_extension_aspect(row, REMOVE)
        })
        .map(|row| &row["config"])
}
