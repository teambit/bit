//! RemoveMain.getRemovedStagedFromMain reads all pending removal configuration.
use super::invalid;
use serde_json::Value;
use std::io;

pub(super) fn read(bytes: &[u8]) -> io::Result<Vec<String>> {
    let rows: Vec<Value> = serde_json::from_slice(bytes)?;
    if rows.len() > 4096 {
        return Err(invalid("outbound removal configuration bounds"));
    }
    rows.iter()
        .filter(|row| {
            crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        })
        .map(|row| {
            if let Some(raw) = row["id"].as_str() {
                let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix);
                let (scope, name) =
                    bare.split_once('/').ok_or_else(|| invalid("outbound removal scope"))?;
                return Ok(format!("{scope}/{name}"));
            }
            let scope =
                row["id"]["scope"].as_str().ok_or_else(|| invalid("outbound removal scope"))?;
            let name =
                row["id"]["name"].as_str().ok_or_else(|| invalid("outbound removal name"))?;
            Ok(format!("{scope}/{name}"))
        })
        .collect()
}
