//! Published package-json indentation, newline detection and serialization.
#[cfg(test)]
mod tests;

use serde::Serialize;
use serde_json::{Value, ser::PrettyFormatter};
use std::io;

/// `stringify-package`: `JSON.stringify` with the indentation (two spaces when
/// none was detected) and a final newline, CRLF throughout for CRLF files.
pub fn stringify_package(value: &Value, indent: &str, newline: Option<&str>) -> io::Result<String> {
    // `JSON.stringify` uses at most ten characters of a string indent.
    let indent: String =
        if indent.is_empty() { "  ".to_string() } else { indent.chars().take(10).collect() };
    let mut bytes = Vec::new();
    let mut serializer = serde_json::Serializer::with_formatter(
        &mut bytes,
        PrettyFormatter::with_indent(indent.as_bytes()),
    );
    value.serialize(&mut serializer).map_err(io::Error::other)?;
    let json = String::from_utf8(bytes).map_err(io::Error::other)?;
    Ok(if newline == Some("\r\n") {
        format!("{}\r\n", json.replace('\n', "\r\n"))
    } else {
        format!("{json}\n")
    })
}

/// `detect-newline` 3: the more frequent of CRLF and LF, `None` without newlines.
#[must_use]
pub fn detect_newline(text: &str) -> Option<&'static str> {
    let total = text.matches('\n').count();
    if total == 0 {
        return None;
    }
    let crlf = text.matches("\r\n").count();
    Some(if crlf > total - crlf { "\r\n" } else { "\n" })
}

/// `detect-indent` 5: the most used indentation step (ties go to the step more
/// lines follow), as spaces unless more lines are indented with tabs; empty when
/// nothing is indented.
#[must_use]
pub fn detect_indent(text: &str) -> String {
    let mut steps = IndentSteps::default();
    let (mut tabs, mut spaces) = (0_usize, 0_usize);
    for line in text
        .split('\n')
        .filter(|line| !line.is_empty())
    {
        let width = match leading(line) {
            Leading::Spaces(width) => {
                spaces += 1;
                width
            }
            Leading::Tabs(width) => {
                tabs += 1;
                width
            }
            Leading::None => 0,
        };
        steps.line(i64::try_from(width).unwrap_or(i64::MAX));
    }
    let amount = steps.most_used();
    if amount == 0 {
        String::new()
    } else if spaces >= tabs {
        " ".repeat(amount)
    } else {
        "\t".repeat(amount)
    }
}

/// `/^(?:( )+|\t+)/`: a run of spaces or a run of tabs, not both.
enum Leading {
    Spaces(usize),
    Tabs(usize),
    None,
}

fn leading(line: &str) -> Leading {
    let run = |character: char| line.len() - line.trim_start_matches(character).len();
    if line.starts_with(' ') {
        Leading::Spaces(run(' '))
    } else if line.starts_with('\t') {
        Leading::Tabs(run('\t'))
    } else {
        Leading::None
    }
}

/// The `indents` map of `detect-indent` 5, in insertion order: each step (signed
/// as first set) with its uses and the lines that follow it as an indent.
#[derive(Default)]
struct IndentSteps {
    previous: i64,
    entries: Vec<(i64, [u64; 2])>,
    current: Option<usize>,
    is_indent: bool,
}

impl IndentSteps {
    fn line(&mut self, indent: i64) {
        let diff = indent - self.previous;
        self.previous = indent;
        if diff == 0 {
            if let Some(found) = self.current {
                self.entries[found].1[1] += u64::from(self.is_indent);
            }
            return;
        }
        self.is_indent = diff > 0;
        self.current = Some(self.step(diff));
    }

    /// `indents.get(|diff|)` gets one more use; otherwise `indents.set(diff, [1, 0])`,
    /// which replaces an earlier unindent entry in place.
    fn step(&mut self, diff: i64) -> usize {
        if let Some(found) = self.position(diff.abs()) {
            self.entries[found].1[0] += 1;
            return found;
        }
        if let Some(found) = self.position(diff) {
            self.entries[found].1 = [1, 0];
            return found;
        }
        self.entries.push((diff, [1, 0]));
        self.entries.len() - 1
    }

    fn position(&self, step: i64) -> Option<usize> {
        self.entries
            .iter()
            .position(|(existing, _)| *existing == step)
    }

    /// `getMostUsed`: the first step with the most uses, then the most weight.
    fn most_used(&self) -> usize {
        let (mut amount, mut max_used, mut max_weight) = (0_i64, 0_u64, 0_u64);
        for (step, [used, weight]) in &self.entries {
            if *used > max_used || (*used == max_used && *weight > max_weight) {
                (amount, max_used, max_weight) = (*step, *used, *weight);
            }
        }
        usize::try_from(amount).unwrap_or(0)
    }
}
