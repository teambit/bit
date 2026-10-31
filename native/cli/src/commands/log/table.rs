//! Borderless cli-table layout used by local and remote one-line history.

use serde_json::Value;
use std::io;
use unicode_width::UnicodeWidthStr;

pub(super) fn one_line(logs: &[Value]) -> io::Result<String> {
    let fields = ["hash", "tag", "username", "date", "message"];
    let rows: Vec<Vec<&str>> = logs
        .iter()
        .map(|row| {
            fields
                .iter()
                .map(|field| log_field(row, field))
                .collect()
        })
        .collect();
    Ok(table(&rows))
}

fn log_field<'a>(row: &'a Value, field: &str) -> &'a str {
    let alias = match field {
        "tag" => Some("version"),
        "username" => Some("author"),
        _ => None,
    };
    row.get(field)
        .and_then(Value::as_str)
        .or_else(|| {
            alias
                .and_then(|key| row.get(key))
                .and_then(Value::as_str)
        })
        .map_or("", str::trim)
}

pub(in crate::commands) fn table(rows: &[Vec<&str>]) -> String {
    table_with_separator(rows, " ")
}

/// `cli-table` styles its middle border separately from plain cell padding.
pub(in crate::commands) fn table_with_separator(rows: &[Vec<&str>], separator: &str) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let widths = column_widths(rows);
    let mut lines = Vec::new();
    for row in rows {
        let cells: Vec<Vec<&str>> = row
            .iter()
            .map(|cell| cell.split('\n').collect())
            .collect();
        let height = cells
            .iter()
            .map(Vec::len)
            .max()
            .unwrap_or(0);
        for line in 0..height {
            let mut output = String::new();
            for (index, cell) in cells.iter().enumerate() {
                let value = cell
                    .get(line)
                    .copied()
                    .unwrap_or_default();
                let width = widths.get(index).copied().unwrap_or(0);
                output.push_str(value);
                output.push_str(&" ".repeat(width.saturating_sub(UnicodeWidthStr::width(value))));
                output.push_str(separator);
            }
            output.truncate(output.len().saturating_sub(separator.len()));
            lines.push(output);
        }
    }
    lines.join("\n")
}

fn column_widths(rows: &[Vec<&str>]) -> Vec<usize> {
    let fields = rows
        .iter()
        .map(Vec::len)
        .max()
        .unwrap_or(0);
    (0..fields)
        .map(|index| {
            rows.iter()
                .filter_map(|row| row.get(index).copied())
                .flat_map(|cell| cell.split('\n'))
                .map(UnicodeWidthStr::width)
                .max()
                .unwrap_or(0)
        })
        .collect()
}
