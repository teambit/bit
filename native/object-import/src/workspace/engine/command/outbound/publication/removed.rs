//! RemoveMain.getRemovedStagedFromMain reads all pending removal configuration.
use super::invalid;
use serde_json::Value;
use std::io;

pub(super) fn read(bytes: &[u8]) -> io::Result<Vec<String>> {
    let rows: Vec<Value> = crate::parse_jsonc(bytes)
        .and_then(|val| serde_json::from_value(val).map_err(io::Error::other))?;
    if rows.len() > 4096 {
        return Err(invalid("outbound removal configuration bounds"));
    }
    rows.iter()
        .filter(|row| {
            crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        })
        .map(|row| {
            if let Some(raw) = row["id"].as_str().map(str::trim) {
                let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
                let (scope, name) = bare
                    .split_once('/')
                    .map(|(scope, name)| (scope.trim(), name.trim()))
                    .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
                    .ok_or_else(|| invalid("outbound removal scope"))?;
                return Ok(format!("{scope}/{name}"));
            }
            let scope = row["id"]["scope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .ok_or_else(|| invalid("outbound removal scope"))?;
            let name = row["id"]["name"]
                .as_str()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .ok_or_else(|| invalid("outbound removal name"))?;
            Ok(format!("{scope}/{name}"))
        })
        .collect()
}
