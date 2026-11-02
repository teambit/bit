//! Native rendering of Doctor's [`table`] output ([`list`], [`results`], [`DIAGNOSES`], [`Chalk`]) and detailed result sections.
#[cfg(test)]
mod tests;

use super::catalog::DIAGNOSES;
use crate::commands::color::Chalk;
use serde_json::Value;
use unicode_width::UnicodeWidthStr;
/// Renders the `bit doctor --list` table of all registered [`DIAGNOSES`].
#[inline]
pub(super) fn list(chalk: Chalk) -> String {
    let mut rows = Vec::with_capacity(1 + DIAGNOSES.len());
    rows.push(vec![chalk.bold("category"), chalk.bold("name"), chalk.bold("description")]);
    rows.extend(
        DIAGNOSES
            .iter()
            .map(|diagnosis| {
                vec![diagnosis.category.into(), diagnosis.name.into(), diagnosis.description.into()]
            }),
    );
    table(&rows)
}
/// Formats `results`, environment `meta`, and optional archive path `saved` into the terminal doctor report.
pub(super) fn results(
    results: &[Value],
    meta: &Value,
    saved: Option<&str>,
    chalk: Chalk,
) -> String {
    let mut rows = Vec::with_capacity(1 + results.len());
    rows.push(vec![
        chalk.bold("category"),
        chalk.bold("name"),
        chalk.bold("description"),
        chalk.bold("status"),
    ]);
    rows.extend(
        results
            .iter()
            .map(|row| {
                let metadata = &row["diagnosisMetaData"];
                vec![
                    text(&metadata["category"]).into(),
                    text(&metadata["name"]).into(),
                    text(&metadata["description"]).into(),
                    if is_passed(row) { chalk.green("passed") } else { chalk.red("failed") },
                ]
            }),
    );
    let full = errors(results, chalk);
    let written = saved
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map_or_else(String::new, |path| format!("File written to {path}"));
    format!("{}\n\n{}\n{full}\n{written}", metadata(meta), table(&rows))
}
/// Returns `true` when `row["bareResult"]` reports a passing diagnosis status.
#[inline]
fn is_passed(row: &Value) -> bool {
    let bare = &row["bareResult"];
    bare["valid"] == true || bare["pass"] == true || bare["passed"] == true
}
/// Returns the trimmed string slice stored in `value`, or `""` when not a string.
#[inline]
fn text(value: &Value) -> &str {
    value
        .as_str()
        .map(str::trim)
        .unwrap_or_default()
}
fn metadata(meta: &Value) -> String {
    let version = |key: &str| {
        meta[key.trim()]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .unwrap_or("NA")
    };
    format!(
        "\n  bit version   : {}\n  node version  : {}\n  npm version   : {}\n  yarn version  : {}\n  platform      : {}\n  user details  : {}\n",
        text(&meta["bitVersion"]),
        text(&meta["nodeVersion"]),
        version("npmVersion"),
        version("yarnVersion"),
        text(&meta["platform"]),
        text(&meta["userDetails"]),
    )
}
fn errors(results: &[Value], chalk: Chalk) -> String {
    let sections = results
        .iter()
        .map(|row| {
            if is_passed(row) {
                String::new()
            } else {
                format!(
                    "{}\n  {}\n  {}\n  {}\n  {}\n",
                    chalk.underline(text(&row["diagnosisMetaData"]["name"])),
                    chalk.underline("symptoms"),
                    text(&row["formattedSymptoms"]),
                    chalk.underline("cure"),
                    text(&row["formattedManualTreat"]),
                )
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    if sections.trim().is_empty() {
        String::new()
    } else {
        format!("{}\n{sections}", chalk.underline("Error report"))
    }
}
fn table(rows: &[Vec<String>]) -> String {
    let mut widths = vec![0; rows.first().map_or(0, Vec::len)];
    for row in rows {
        for (index, cell) in row.iter().enumerate() {
            if let Some(col_width) = widths.get_mut(index) {
                *col_width = (*col_width).max(width(cell) + 2);
            }
        }
    }
    let mut output = border(&widths, ['╔', '╤', '╗', '═']);
    for (index, row) in rows.iter().enumerate() {
        output.push_str(&line(row, &widths));
        if index + 1 < rows.len() {
            output.push_str(&border(&widths, ['╟', '┼', '╢', '─']));
        }
    }
    output.push_str(&border(&widths, ['╚', '╧', '╝', '═']));
    output
}
#[inline]
fn width(text: &str) -> usize {
    UnicodeWidthStr::width(strip(text).as_str())
}
#[inline]
fn border(widths: &[usize], chars: [char; 4]) -> String {
    format!(
        "{}{}{}\n",
        chars[0],
        widths
            .iter()
            .map(|width| chars[3].to_string().repeat(*width))
            .collect::<Vec<_>>()
            .join(&chars[1].to_string()),
        chars[2],
    )
}
#[inline]
fn line(row: &[String], widths: &[usize]) -> String {
    format!(
        "║{}║\n",
        row.iter()
            .zip(widths)
            .map(|(cell, length)| {
                format!(" {cell}{}", " ".repeat(length.saturating_sub(width(cell) + 1)))
            })
            .collect::<Vec<_>>()
            .join("│"),
    )
}

pub(super) fn strip(text: &str) -> String {
    if !text.contains("\u{1b}[") {
        return text.to_owned();
    }
    let mut output = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("\u{1b}[") {
        output.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let end = after.find(['m', '\n', '\r', '\u{2028}', '\u{2029}']);
        if let Some(end) = end.filter(|end| after.as_bytes()[*end] == b'm') {
            rest = &after[end + 1..];
        } else {
            output.push_str("\u{1b}[");
            rest = after;
        }
    }
    output.push_str(rest);
    output
}
