//! `cli-table` 0.3.6 as `listTemplate` uses it: a cyan head, grey borders
//! (both from `colors` 1.0.3), one padded cell per column.

use std::{env, ffi::OsString, io::IsTerminal};

/// `colors.supportsColor` of `colors` 1.0.3.
pub(crate) fn colors(args: &[OsString]) -> bool {
    let has = |flag: &str| args.iter().any(|arg| arg == flag);
    if has("--no-color") || has("--no-color=true") || has("--color=false") || has("--color=never") {
        return false;
    }
    if has("--color") || has("--color=true") || has("--color=always") || has("--no-color=false") {
        return true;
    }
    if !std::io::stdout().is_terminal() {
        return false;
    }
    if cfg!(windows)
        || env::var_os("COLORTERM").is_some_and(|val| !val.to_string_lossy().trim().is_empty())
    {
        return true;
    }
    let term = env::var("TERM").unwrap_or_default();
    let term = term.trim();
    if term == "dumb" {
        return false;
    }
    let lower = term.to_ascii_lowercase();
    lower.starts_with("screen")
        || lower.starts_with("xterm")
        || lower.starts_with("vt100")
        || ["color", "ansi", "cygwin", "linux"]
            .iter()
            .any(|word| lower.contains(word))
}

const CYAN: (&str, &str) = ("\u{1b}[36m", "\u{1b}[39m");
const GREY: (&str, &str) = ("\u{1b}[90m", "\u{1b}[39m");

/// `colors[style](text)`: the close codes inside become open codes.
fn style(enabled: bool, (open, close): (&str, &str), text: &str) -> String {
    if !enabled || text.is_empty() {
        return text.to_string();
    }
    format!("{open}{}{close}", text.replace(close, open))
}

/// `utils.strlen`: the longest line in UTF-16 units, without SGR codes.
fn strlen(text: &str) -> usize {
    strip_sgr(text)
        .split('\n')
        .map(|line| line.encode_utf16().count())
        .max()
        .unwrap_or(0)
}

/// `/\u001b\[(?:\d*;){0,5}\d*m/g` replaced with nothing.
pub(crate) fn strip_sgr(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("\u{1b}[") {
        output.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        if let Some(length) = sgr_length(after) {
            rest = &after[length..];
        } else {
            output.push_str("\u{1b}[");
            rest = after;
        }
    }
    output.push_str(rest);
    output
}

/// The length of `(?:\d*;){0,5}\d*m` at the start of `text`, if it matches.
fn sgr_length(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = 0;
    let mut separators = 0;
    loop {
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        match bytes.get(index) {
            Some(b'm') => return Some(index + 1),
            Some(b';') if separators < 5 => {
                separators += 1;
                index += 1;
            }
            _ => return None,
        }
    }
}

/// `Table.toString()` with `head` and `rows`.
pub(crate) fn render(head: &[&str], rows: &[Vec<String>], colors: bool) -> String {
    let head: Vec<String> = head
        .iter()
        .map(|cell| (*cell).to_string())
        .collect();
    let widths = widths(&head, rows);
    let mut output = line(&widths, ['┌', '┐', '┬'], colors);
    output.push('\n');
    output.push_str(&row(&head, &widths, colors, true));
    output.push('\n');
    for cells in rows {
        output.push_str(&line(&widths, ['├', '┤', '┼'], colors));
        output.push('\n');
        output.push_str(&row(cells, &widths, colors, false));
        output.push('\n');
    }
    output.push_str(&line(&widths, ['└', '┘', '┴'], colors));
    output
}

/// Each column's width: its longest cell and the padding.
fn widths(head: &[String], rows: &[Vec<String>]) -> Vec<usize> {
    let mut widths: Vec<usize> = head
        .iter()
        .map(|cell| strlen(cell) + 2)
        .collect();
    for row in rows {
        for (index, cell) in row.iter().enumerate() {
            widths[index] = widths[index].max(strlen(cell) + 2);
        }
    }
    widths
}

/// A border line: `─` across the columns, with its left, right and
/// intersection characters.
fn line(widths: &[usize], [left, right, middle]: [char; 3], colors: bool) -> String {
    let columns: Vec<String> = widths
        .iter()
        .map(|width| "─".repeat(*width))
        .collect();
    style(colors, GREY, &format!("{left}{}{right}", columns.join(&middle.to_string())))
}

/// `generateRow`: each cell's lines padded, side by side.
fn row(cells: &[String], widths: &[usize], colors: bool, head: bool) -> String {
    let contents: Vec<Vec<String>> = cells
        .iter()
        .enumerate()
        .map(|(index, cell)| {
            cell.split('\n')
                .map(|line| pad(line, widths[index]))
                .collect()
        })
        .collect();
    let height = contents
        .iter()
        .map(Vec::len)
        .max()
        .unwrap_or(0);
    let border = |character: &str| style(colors, GREY, character);
    (0..height)
        .map(|line| {
            let cells: Vec<String> = contents
                .iter()
                .enumerate()
                .map(|(index, lines)| match lines.get(line) {
                    Some(text) if head => style(colors, CYAN, text),
                    Some(text) => text.clone(),
                    None => pad("", widths[index]),
                })
                .collect();
            format!("{}{}{}", border("│"), cells.join(&border("│")), border("│"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// `string(str, index)`: one space either side, padded on the right to the
/// column's width.
fn pad(text: &str, width: usize) -> String {
    let inner = width.saturating_sub(2);
    let length = strlen(text);
    let padding = inner.saturating_sub(length);
    format!(" {text}{} ", " ".repeat(padding))
}
