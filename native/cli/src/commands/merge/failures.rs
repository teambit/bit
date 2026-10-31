//! `MergingMain.throwForFailures`: reject failed components before workspace publication.
use crate::commands::{color::Chalk, status::js::array};
use serde_json::Value;
use std::io;

pub(super) fn check(result: &Value, chalk: Chalk, lane: bool) -> io::Result<()> {
    let mut failures = Vec::new();
    for row in array(result.get("failedComponents"), "merge failed components")? {
        if row["unchangedLegitimately"] == true {
            continue;
        }
        let identity = row_identity(row).ok_or_else(|| io::Error::other("merge failure id"))?;
        let message = row["unchangedMessage"]
            .as_str()
            .or_else(|| row["unchangedMessage"]["message"].as_str())
            .or_else(|| row["message"].as_str())
            .or_else(|| row["error"].as_str())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| io::Error::other("merge failure message"))?;
        failures.push(format!("{} - {}", chalk.bold(&identity), chalk.red(message)));
    }
    if failures.is_empty() {
        return Ok(());
    }
    if std::env::var_os("CI").is_some_and(|value| !value.is_empty()) {
        return Err(io::Error::other("published CI error diagnostic stack"));
    }
    let operation = if lane { "proceed" } else { "merge" };
    Err(crate::commands::engine::canonical_error(format!(
        "unable to {operation} due to the following failures:\n{}",
        failures.join("\n"),
    )))
}

fn row_identity(row: &Value) -> Option<String> {
    if let Some(identity) = row["id"]
        .as_str()
        .or_else(|| row["identity"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(identity.to_owned());
    }
    let object = row["id"].as_object()?;
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
