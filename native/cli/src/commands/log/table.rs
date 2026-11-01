//! Borderless cli-table layout used by local and remote one-line history.
//!
//! [`one_line`] formats log [`Value`] entries using display column widths from [`UnicodeWidthStr`].

use serde_json::Value;
use std::io;
use unicode_width::UnicodeWidthStr;

#[inline]
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

#[inline]
fn log_field<'a>(row: &'a Value, field: &str) -> &'a str {
    let alias = match field {
        "tag" => Some("version"),
        "username" => Some("author"),
        _ => None,
    };
    row.get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .or_else(|| {
            alias
                .and_then(|key| row.get(key))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|val| !val.is_empty())
        })
        .unwrap_or("")
}

#[inline]
pub(in crate::commands) fn table(rows: &[Vec<&str>]) -> String {
    table_with_separator(rows, " ")
}

/// `cli-table` styles its middle border separately from plain cell padding.
pub(in crate::commands) fn table_with_separator(rows: &[Vec<&str>], separator: &str) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let widths = column_widths(rows);
    let mut lines = Vec::with_capacity(rows.len());
    for row in rows {
        let cells: Vec<Vec<&str>> = row
            .iter()
            .map(|cell| {
                cell.split('\n')
                    .map(|line| line.strip_suffix('\r').unwrap_or(line))
                    .collect()
            })
            .collect();
        let height = cells
            .iter()
            .map(Vec::len)
            .max()
            .unwrap_or(0);
        for line in 0..height {
            lines.push(format_row_line(&cells, &widths, line, separator));
        }
    }
    lines.join("\n")
}

#[inline]
fn format_row_line(cells: &[Vec<&str>], widths: &[usize], line: usize, separator: &str) -> String {
    let mut output = String::with_capacity(widths.iter().sum::<usize>() + cells.len());
    for (index, cell) in cells.iter().enumerate() {
        if index > 0 {
            output.push_str(separator);
        }
        let value = cell
            .get(line)
            .copied()
            .unwrap_or_default();
        let width = widths.get(index).copied().unwrap_or(0);
        output.push_str(value);
        let padding = width.saturating_sub(UnicodeWidthStr::width(value));
        output.extend(std::iter::repeat_n(' ', padding));
    }
    output
}

#[inline]
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
                .map(|line| UnicodeWidthStr::width(line.strip_suffix('\r').unwrap_or(line)))
                .max()
                .unwrap_or(0)
        })
        .collect()
}
