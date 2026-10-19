//! The released lane revert JSON projection and alternative checkout title.
use super::options::Options;
use crate::commands::{
    checkout,
    color::Chalk,
    workspace_command::{format::Formatter, results::Report},
};
use serde_json::{Value, json};
use std::io;

pub(super) fn render(result: &Value, options: &Options, chalk: Chalk) -> io::Result<Report> {
    if options.json {
        return Ok(Report {
            data: serde_json::to_string_pretty(&project(result, &options.id))?,
            code: 0,
            details: None,
        });
    }
    let title = format!(
        "successfully {} according to history-id: {}",
        if options.revert { "reverted" } else { "checked out" },
        options.id,
    );
    let mut report = checkout::report::format_title(
        result,
        &checkout::options::Options::default(),
        chalk,
        Some(&title),
    )?;
    let mut sections = vec![report.data];
    if let Some(error) = result["installationError"].as_str() {
        sections.push(crate::commands::installation::error_report(chalk, error));
    }
    if let Some(error) = result["compilationError"].as_str() {
        let formatter = Formatter::new(chalk);
        sections.push(format!("{} {}\nThe following error was thrown by the compiler\n{}\nPlease fix the issue and run \"bit compile\"",
            formatter.error_symbol(), formatter.title("Compilation Error"), chalk.red(error)));
    }
    report.data = Formatter::join(&sections);
    Ok(report)
}

const RESULT_FIELDS: [&str; 14] = [
    "components",
    "removedComponents",
    "addedComponents",
    "newComponents",
    "failedComponents",
    "leftUnresolvedConflicts",
    "newFromLane",
    "newFromLaneAdded",
    "version",
    "resolvedComponents",
    "abortedComponents",
    "installationError",
    "compilationError",
    "mergeSnapError",
];

fn project(result: &Value, id: &str) -> Value {
    let mut projected = serde_json::Map::new();
    for name in RESULT_FIELDS {
        if let Some(value) = result.get(name) {
            projected.insert(name.into(), value.clone());
        }
    }
    projected.insert(
        "mergeSnapResults".into(),
        result
            .get("mergeSnapResults")
            .cloned()
            .unwrap_or(Value::Null),
    );
    if let Some(logs) = result
        .get("workspaceConfigUpdateResult")
        .and_then(|value| value.get("logs"))
    {
        projected.insert("workspaceConfigUpdateResult".into(), json!({"logs":logs}));
    }
    projected.insert("historyId".into(), json!(id));
    Value::Object(projected)
}

pub(super) fn merge(first: &mut Value, second: &Value) -> io::Result<()> {
    for key in ["components", "addedComponents"] {
        let mut rows = first
            .get(key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        rows.extend(
            second
                .get(key)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
        );
        first
            .as_object_mut()
            .ok_or_else(|| io::Error::other("lane history checkout result"))?
            .insert(key.into(), Value::Array(rows));
    }
    Ok(())
}

#[cfg(test)]
#[path = "report_tests.rs"]
mod tests;
