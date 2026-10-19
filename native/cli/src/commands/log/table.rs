//! Borderless cli-table layout used by local and remote one-line history.

use unicode_width::UnicodeWidthStr;

pub(in crate::commands) fn table(rows: &[Vec<&str>]) -> String {
    table_with_separator(rows, " ")
}

/// `cli-table` styles its middle border separately from plain cell padding.
pub(in crate::commands) fn table_with_separator(rows: &[Vec<&str>], separator: &str) -> String {
    let fields = rows.first().map_or(0, Vec::len);
    let widths: Vec<usize> = (0..fields)
        .map(|index| {
            rows.iter()
                .flat_map(|row| row[index].split('\n'))
                .map(UnicodeWidthStr::width)
                .max()
                .unwrap_or(0)
        })
        .collect();
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
                output.push_str(value);
                output.push_str(&" ".repeat(widths[index].saturating_sub(UnicodeWidthStr::width(
                    value,
                ))));
                output.push_str(separator);
            }
            output.truncate(output.len().saturating_sub(separator.len()));
            lines.push(output);
        }
    }
    lines.join("\n")
}
