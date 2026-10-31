use super::invalid;
use serde_json::Value;
use std::io;

pub(super) fn validate(kind: &str, data: &str) -> io::Result<()> {
    let fields: serde_json::Map<String, Value> =
        serde_json::from_str(data).map_err(io::Error::other)?;
    if fields.len() > 4096 {
        return Err(invalid("relative issue field budget"));
    }
    for value in fields.values() {
        if kind == "UntrackedDependencies" {
            untracked(value)?;
        } else {
            authored(value)?;
        }
    }
    Ok(())
}

fn untracked(value: &Value) -> io::Result<()> {
    if !value["nested"].is_boolean() {
        return Err(invalid("untracked issue nested flag"));
    }
    let files =
        value["untrackedFiles"].as_array().ok_or_else(|| invalid("untracked issue files"))?;
    if files.len() > 4096
        || files
            .iter()
            .any(|file| {
                file["relativePath"]
                    .as_str()
                    .map(str::trim)
                    .is_none_or(str::is_empty)
                    || !file["existing"].is_boolean()
            })
    {
        return Err(invalid("untracked issue file record"));
    }
    Ok(())
}

fn authored(value: &Value) -> io::Result<()> {
    let records = value.as_array().ok_or_else(|| invalid("relative authored issue records"))?;
    if records.len() > 4096 {
        return Err(invalid("relative authored issue budget"));
    }
    for record in records {
        let valid_id = record["componentId"]
            .as_str()
            .is_some_and(|raw| !raw.trim().is_empty())
            || record["componentId"]
                .get("_legacy")
                .unwrap_or_else(|| &record["componentId"])["name"]
                .as_str()
                .is_some_and(|name| !name.trim().is_empty());
        if record["importSource"]
            .as_str()
            .map(str::trim)
            .is_none_or(str::is_empty)
            || !valid_id
            || record["relativePath"]["sourceRelativePath"]
                .as_str()
                .map(str::trim)
                .is_none_or(str::is_empty)
            || record["relativePath"]["destinationRelativePath"]
                .as_str()
                .map(str::trim)
                .is_none_or(str::is_empty)
        {
            return Err(invalid("relative authored issue record"));
        }
    }
    Ok(())
}
