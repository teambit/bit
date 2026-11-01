//! Node's inspection of a filesystem callback error, which has no JavaScript stack frames.
#[cfg(test)]
mod tests;

use super::Failure;
use crate::commands::color::Chalk;
use std::fmt::Write;

#[must_use]
#[inline]
pub(super) fn render(error: &Failure, chalk: Chalk) -> String {
    let mut fields = Vec::with_capacity(5);
    if let Some(errno) = error.errno {
        fields.push(format!("errno: {}", chalk.yellow(&errno.to_string())));
    }
    for (key, value) in [
        ("code", error.code.trim()),
        ("syscall", error.operation.trim()),
        ("path", error.path.trim()),
    ] {
        fields.push(format!("{key}: {}", chalk.green(&quote(value))));
    }
    if let Some(destination) = error.destination
        .as_deref()
        .map(str::trim)
        .filter(|dest| !dest.is_empty())
    {
        fields.push(format!("dest: {}", chalk.green(&quote(destination))));
    }
    format!("[Error: {}] {{\n  {}\n}}", error.description(), fields.join(",\n  "))
}

#[inline]
fn needs_escaping(value: &str, delimiter: char) -> bool {
    value
        .chars()
        .any(|ch| ch == '\\' || ch == delimiter || ch.is_control())
}

#[inline]
fn select_delimiter(value: &str) -> char {
    if !value.contains('\'') {
        '\''
    } else if !value.contains('"') {
        '"'
    } else if !value.contains('`') && !value.contains("${") {
        '`'
    } else {
        '\''
    }
}

fn quote(value: &str) -> String {
    let delimiter = select_delimiter(value);
    if !needs_escaping(value, delimiter) {
        return format!("{delimiter}{value}{delimiter}");
    }
    let mut result = String::with_capacity(value.len() + 2);
    result.push(delimiter);
    for character in value.chars() {
        match character {
            '\\' => result.push_str(r"\\"),
            '\n' => result.push_str(r"\n"),
            '\r' => result.push_str(r"\r"),
            '\t' => result.push_str(r"\t"),
            '\u{8}' => result.push_str(r"\b"),
            '\u{c}' => result.push_str(r"\f"),
            character if character == delimiter => {
                result.push('\\');
                result.push(character);
            }
            character if character.is_control() => {
                let _ = write!(result, r"\x{:02X}", u32::from(character));
            }
            _ => result.push(character),
        }
    }
    result.push(delimiter);
    result
}
