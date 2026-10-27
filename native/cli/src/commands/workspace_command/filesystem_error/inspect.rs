//! Node's inspection of a filesystem callback error, which has no JavaScript stack frames.
use super::Failure;
use crate::commands::color::Chalk;
use std::fmt::Write;
#[cfg(test)]
mod tests;

pub(super) fn render(error: &Failure, chalk: Chalk) -> String {
    let mut fields = Vec::new();
    if let Some(errno) = error.errno {
        fields.push(format!("errno: {}", chalk.yellow(&errno.to_string())));
    }
    for (key, value) in [("code", error.code), ("syscall", &error.operation), ("path", &error.path)]
    {
        fields.push(format!("{key}: {}", chalk.green(&quote(value))));
    }
    if let Some(destination) = &error.destination {
        fields.push(format!("dest: {}", chalk.green(&quote(destination))));
    }
    format!("[Error: {}] {{\n  {}\n}}", error.description(), fields.join(",\n  "))
}
fn quote(value: &str) -> String {
    let delimiter = if !value.contains('\'') {
        '\''
    } else if !value.contains('"') {
        '"'
    } else if !value.contains('`') && !value.contains("${") {
        '`'
    } else {
        '\''
    };
    let mut result = String::from(delimiter);
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
                write!(result, r"\x{:02X}", u32::from(character)).unwrap();
            }
            _ => result.push(character),
        }
    }
    result.push(delimiter);
    result
}
