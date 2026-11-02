//! Dependency [`table`]s ([`format`]) produced by `diffMetadata` and cli-table 0.3.6 ([`Chalk`]).

use crate::commands::{
    color::Chalk,
    list::table,
    status::js::{decline, text},
};
use node_semver::npm;
use serde_json::Value;
use std::{cmp::Ordering, io};

/// Rewrites dependency `fieldsDiff` entries in `row` as cli-table 0.3.6 formatted tables when `--table` is set.
pub(super) fn format(row: &mut Value) -> io::Result<()> {
    let Some(fields) = row.get_mut("fieldsDiff").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    let args = std::env::args_os().collect::<Vec<_>>();
    let colors = table::colors(&args);
    let chalk = Chalk::detect(&args);
    for field in fields {
        let name = text(
            field
                .get("fieldName")
                .or_else(|| field.get("name")),
        )?
        .trim();
        if !matches!(
            name,
            "packageDependencies"
                | "devPackageDependencies"
                | "peerPackageDependencies"
                | "dependencies"
                | "devDependencies"
                | "peerDependencies"
                | "extensionDependencies",
        ) {
            continue;
        }
        field["diffOutput"] =
            Value::String(render(name, text(field.get("diffOutput"))?, colors, chalk)?);
    }
    Ok(())
}

/// Parses a plain-text dependency diff `diff` for `name` and renders it as a 4-column CLI table.
fn render(name: &str, diff: &str, colors: bool, chalk: Chalk) -> io::Result<String> {
    let plain = table::strip_sgr(diff);
    let mut lines = plain.trim_start_matches('\n').lines();
    let left = label(lines.next(), &format!("--- {name} "), " original")?;
    let right = label(lines.next(), &format!("+++ {name} "), " modified")?;
    let rows = changes(lines.collect::<Vec<_>>().as_slice())?;
    let title = chalk.bold(name);
    Ok(format!("\n{title}\n{}", table::render(&["name", "diff", left, right], &rows, colors)))
}

/// Extracts the version label from a `--- <name> <label>` or `+++ <name> <label>` diff header line.
#[inline]
fn label<'a>(line: Option<&'a str>, prefix: &str, suffix: &str) -> io::Result<&'a str> {
    let label = line
        .and_then(|line| line.strip_prefix(prefix))
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .ok_or_else(|| decline("dependency diff label"))?;
    let stripped = label.strip_suffix(suffix).map_or(label, str::trim);
    if stripped.is_empty() {
        return Err(decline("dependency diff label"));
    }
    Ok(stripped)
}

/// Parses plain-text dependency diff body `lines` into `[name, diff, left, right]` table rows.
fn changes(lines: &[&str]) -> io::Result<Vec<Vec<String>>> {
    let mut rows = Vec::new();
    let mut index = 0;
    while let Some(name) = lines.get(index) {
        index += 1;
        let name = name.trim();
        if name.is_empty() {
            continue;
        }
        let left = version(lines.get(index).copied(), "- ", name);
        index += usize::from(left.is_some());
        let right = version(lines.get(index).copied(), "+ ", name);
        index += usize::from(right.is_some());
        let kind = change_type(left, right)?;
        rows.push(vec![
            name.to_string(),
            kind.to_string(),
            left.unwrap_or("---").to_string(),
            right.unwrap_or("---").to_string(),
        ]);
    }
    Ok(rows)
}

#[inline]
fn version<'a>(line: Option<&'a str>, prefix: &str, name: &str) -> Option<&'a str> {
    let rest = line?
        .trim()
        .strip_prefix(prefix)?
        .strip_prefix(name)?;
    rest.strip_prefix('@')
        .or_else(|| rest.strip_prefix(' '))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[inline]
fn change_type(left: Option<&str>, right: Option<&str>) -> io::Result<&'static str> {
    match (left, right) {
        (Some(_), None) => Ok("removed"),
        (None, Some(_)) => Ok("added"),
        (Some(left), Some(right)) => Ok(match npm::compare(left, right, true) {
            Some(Ordering::Less) => "upgraded",
            Some(Ordering::Greater) => "downgraded",
            _ => "changed",
        }),
        (None, None) => Err(decline("empty dependency diff")),
    }
}
