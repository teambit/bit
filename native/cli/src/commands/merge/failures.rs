//! `MergingMain.throwForFailures`: reject failed components before workspace publication.
use crate::commands::{
    color::Chalk,
    status::js::{array, text},
};
use serde_json::Value;
use std::io;

pub(super) fn check(result: &Value, chalk: Chalk, lane: bool) -> io::Result<()> {
    let mut failures = Vec::new();
    for row in array(result.get("failedComponents"), "merge failed components")? {
        if row["unchangedLegitimately"] == true {
            continue;
        }
        let identity = text(row.get("id"))?;
        let message = row["unchangedMessage"]
            .as_str()
            .or_else(|| row["unchangedMessage"]["message"].as_str())
            .ok_or_else(|| io::Error::other("merge failure message"))?;
        failures.push(format!("{} - {}", chalk.bold(identity), chalk.red(message)));
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
