//! Resolve per-component editor and pending soft-tag logs via [`apply`] on [`Retained`].
//! Populates default `"bump dependencies versions"` messages on auto-snapped dependents.

use super::{Retained, invalid};
use serde_json::{Map, Value, json};
use std::io;

/// Applies per-component editor, soft-tag, and auto-tag log messages to the snap receipt.
pub(super) fn apply(retained: &Retained, receipt: &mut Value) -> io::Result<()> {
    if retained.snap.is_none() {
        return Ok(());
    }
    let common = &receipt["log"];
    let mut logs = Map::with_capacity(retained.materials.len());
    for material in &retained.materials {
        let mut log = common.clone();
        merge(&mut log, editor(receipt, &material.identity))?;
        if retained.tag.as_ref().is_some_and(|options| options.persist) {
            let pending = retained.record.targets
                .iter()
                .find(|target| row_identity(target) == Some(material.identity.as_str()))
                .map_or(&Value::Null, |target| &target["nextVersion"]);
            merge(&mut log, pending)?;
        }
        if material.participation.automatic && !material.participation.selected {
            automatic(
                &mut log,
                common["message"]
                    .as_str()
                    .is_some_and(|message| !message.trim().is_empty()),
            );
        }
        logs.insert(material.identity.clone(), log);
    }
    if let Some(versions) = receipt["versions"].as_array_mut() {
        for version in versions {
            let identity = row_identity(version).ok_or_else(|| invalid("snapshot log identity"))?;
            version["log"] = logs
                .get(identity)
                .cloned()
                .ok_or_else(|| invalid("snapshot log outside batch"))?;
            version["logResolved"] = json!(true);
        }
    }
    receipt["componentLogs"] = Value::Object(logs);
    Ok(())
}

/// Extracts the bare `scope/name` component identity from `row["identity"]` or `row["id"]`.
#[inline]
fn row_identity(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
        .map(str::trim)
        .map(|raw| raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim()))
        .filter(|base| !base.is_empty())
}

#[inline]
fn editor<'a>(receipt: &'a Value, identity: &str) -> &'a Value {
    receipt["messages"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|row| row_identity(row) == Some(identity))
        .or_else(|| {
            receipt["versions"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|row| row_identity(row) == Some(identity))
                .and_then(|row| row.get("log"))
        })
        .unwrap_or(&Value::Null)
}

#[inline]
fn merge(log: &mut Value, values: &Value) -> io::Result<()> {
    for field in ["message", "username", "email"] {
        if let Some(value) = values.get(field) {
            let text = value.as_str().ok_or_else(|| invalid("snapshot log field"))?;
            if !text.trim().is_empty() {
                log[field] = value.clone();
            }
        }
    }
    Ok(())
}

#[inline]
fn automatic(log: &mut Value, explicit_message: bool) {
    let message = log["message"].as_str().unwrap_or_default();
    if explicit_message {
        log["message"] = json!(format!("{message} (bump dependencies versions)"));
    } else if message.trim().is_empty() {
        log["message"] = json!("bump dependencies versions");
    }
}
