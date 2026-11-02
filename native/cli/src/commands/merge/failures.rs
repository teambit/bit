//! `MergingMain.throwForFailures`: reject failed components before workspace publication.
//!
//! [`check`] inspects `failedComponents` entries ([`array`]) and formats abort errors with [`Chalk`].
use crate::commands::{color::Chalk, status::js::array};
use serde_json::Value;
use std::io;

/// Rejects merge results containing non-legitimate `failedComponents` entries before workspace publication.
pub(super) fn check(result: &Value, chalk: Chalk, lane: bool) -> io::Result<()> {
    let rows = array(result.get("failedComponents"), "merge failed components")?;
    let mut failures = Vec::with_capacity(rows.len());
    for row in rows {
        if row["unchangedLegitimately"].as_bool() == Some(true) {
            continue;
        }
        let identity = row_identity(row).ok_or_else(|| io::Error::other("merge failure id"))?;
        let message = row["unchangedMessage"]
            .as_str()
            .or_else(|| row["unchangedMessage"]["message"].as_str())
            .or_else(|| row["message"].as_str())
            .or_else(|| row["error"].as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| io::Error::other("merge failure message"))?;
        failures.push(format!("{} - {}", chalk.bold(&identity), chalk.red(message)));
    }
    if failures.is_empty() {
        return Ok(());
    }
    if crate::commands::scope_rename::ci_active() {
        return Err(io::Error::other("published CI error diagnostic stack"));
    }
    let operation = if lane { "proceed" } else { "merge" };
    Err(crate::commands::engine::canonical_error(format!(
        "unable to {operation} due to the following failures:\n{}",
        failures.join("\n"),
    )))
}

/// Extracts the formatted component ID string from a `failedComponents` entry `row`.
fn row_identity(row: &Value) -> Option<String> {
    if let Some(identity) = row["id"]
        .as_str()
        .or_else(|| row["identity"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(identity.to_owned());
    }
    let outer = row["id"].as_object()?;
    let object = outer
        .get("_legacy")
        .and_then(Value::as_object)
        .unwrap_or(outer);
    let name = object
        .get("name")?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let base = match object
        .get("scope")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(scope) => format!("{scope}/{name}"),
        None => name.to_owned(),
    };
    match object
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(version) => Some(format!("{base}@{version}")),
        None => Some(base),
    }
}
