//! Text and JSON report formatting ([`render`], [`Formatter`], [`Chalk`]) for `bit format`.

use super::{Value, invalid};
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use std::io;
/// Renders the human-readable terminal summary for a completed `bit format` run.
fn render(
    value: &Value,
    chalk: Chalk,
    seconds: f64,
    progress: &super::progress::Progress,
    check: bool,
) -> io::Result<String> {
    let formatter = Formatter::new(chalk);
    let name = progress.name.trim();
    let rows = value["results"].as_array().ok_or_else(|| invalid("formatter result rows"))?;
    let mut sections = Vec::with_capacity(rows.len() + 2);
    sections.push(formatter.title(&format!(
        "formatting total of {} component(s) in workspace '{name}'",
        progress.identities.len(),
    )));
    for row in rows {
        sections.push(component(row, &formatter, check)?);
    }
    let elapsed = if seconds.is_finite() && seconds > 0.0 {
        (seconds * 1000.0).round() / 1000.0
    } else {
        0.0
    };
    sections.push(formatter.hint(&format!(
        "formatted {} components in {elapsed}s.",
        progress.identities.len(),
    )));
    Ok(Formatter::join(&sections))
}
/// Formats the per-component file issue or reformatted-file list for `row`.
fn component(row: &Value, formatter: &Formatter, check: bool) -> io::Result<String> {
    let (scope, name) = component_scope_and_name(&row["componentId"])?;
    let files = row["results"].as_array().ok_or_else(|| invalid("formatter file results"))?;
    let issues: Vec<_> = files
        .iter()
        .filter(|file| file_has_issues(file))
        .collect();
    let mut lines = Vec::with_capacity(issues.len().max(1) + 2);
    lines.push(formatter.title(&format!("{scope}/{name}")));
    if issues.is_empty() {
        lines.push(formatter.success_summary("no issues found"));
    } else {
        lines.push(if check {
            format!("{} issues found in the following files:", formatter.error_symbol())
        } else {
            formatter.success_summary("the following files have been re-formatted:")
        });
        for file in issues {
            lines.push(
                formatter.item(
                    file["filePath"]
                        .as_str()
                        .map(str::trim)
                        .filter(|path| !path.is_empty())
                        .ok_or_else(|| invalid("formatter report filename"))?,
                ),
            );
        }
    }
    Ok(lines.join("\n"))
}

/// Extracts the `(scope, name)` pair from a string or legacy object `componentId` value.
#[inline]
fn component_scope_and_name(id: &Value) -> io::Result<(&str, &str)> {
    if let Some(raw) = id.as_str() {
        let trimmed = raw.trim();
        return trimmed
            .rsplit_once('@')
            .map_or(trimmed, |(bare, _)| bare.trim())
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("formatter scope"));
    }
    let scope = id["_legacy"]["scope"]
        .as_str()
        .or_else(|| id["_scope"].as_str())
        .or_else(|| id["scope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("formatter scope"))?;
    let name = id["_legacy"]["name"]
        .as_str()
        .or_else(|| id["_name"].as_str())
        .or_else(|| id["name"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("formatter name"))?;
    Ok((scope, name))
}

/// Builds the text or `--json` [`crate::commands::workspace_command::results::Report`] for `bit format`.
#[inline]
pub(super) fn create(
    value: &Value,
    progress: &super::progress::Progress,
    args: &[std::ffi::OsString],
    options: &super::Options,
    seconds: f64,
) -> io::Result<crate::commands::workspace_command::results::Report> {
    let rows = value["results"].as_array().ok_or_else(|| invalid("formatter status rows"))?;
    let code = i32::from(
        options.check
            && rows
                .iter()
                .any(|row| {
                    row["results"]
                        .as_array()
                        .is_some_and(|files| files.iter().any(file_has_issues))
                }),
    );
    let data = if options.json {
        serde_json::to_string_pretty(value)?
    } else {
        render(value, Chalk::detect(args), seconds, progress, options.check)?
    };
    Ok(crate::commands::workspace_command::results::Report { data, code, details: None })
}

#[inline]
fn file_has_issues(file: &Value) -> bool {
    file["hasIssues"] == true
        || file["hasIssues"]
            .as_str()
            .is_some_and(|val| val.trim().eq_ignore_ascii_case("true"))
}
