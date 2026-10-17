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
        .filter(|row| row["config"]["teambit.component/remove"]["removed"] == true)
        .map(|row| {
            let scope =
                row["id"]["scope"].as_str().ok_or_else(|| invalid("outbound removal scope"))?;
            let name =
                row["id"]["name"].as_str().ok_or_else(|| invalid("outbound removal name"))?;
            Ok(format!("{scope}/{name}"))
        })
        .collect()
}
