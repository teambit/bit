//! Published ordered global replacements; binary component sources remain unchanged.
use super::{invalid, unsupported};
use regress::Regex;
use std::io;

pub(super) fn content(bytes: &[u8], source: &str, target: &str) -> io::Result<Vec<u8>> {
    if crate::checkout::eol::binary(bytes) {
        return Ok(bytes.to_vec());
    }
    let mut text = String::from_utf8_lossy(bytes).into_owned();
    for (old, new) in [
        (source.to_owned(), target.to_owned()),
        (camel(source, false), camel(target, false)),
        (camel(source, true), camel(target, true)),
    ] {
        text = replace(&text, &old, &new)?;
    }
    Ok(text.into_bytes())
}
pub(super) fn package(bytes: &[u8], source: &str, target: &str) -> io::Result<Vec<u8>> {
    if crate::checkout::eol::binary(bytes) {
        return Ok(bytes.to_vec());
    }
    let text = String::from_utf8_lossy(bytes);
    let regex =
        Regex::new(&format!(r#"{source}(['"/])"#)).map_err(|error| invalid(error.to_string()))?;
    let mut output = String::new();
    let mut offset = 0;
    for found in regex.find_iter(&text) {
        output.push_str(&text[offset..found.range.start]);
        output.push_str(target);
        if let Some(suffix) = found.captures.first().and_then(Clone::clone) {
            output.push_str(&text[suffix]);
        }
        offset = found.range.end;
    }
    output.push_str(&text[offset..]);
    Ok(output.into_bytes())
}
fn replace(text: &str, old: &str, new: &str) -> io::Result<String> {
    let regex = Regex::new(old).map_err(|error| invalid(error.to_string()))?;
    let mut output = String::new();
    let mut offset = 0;
    for found in regex.find_iter(text) {
        output.push_str(&text[offset..found.range.start]);
        output.push_str(new);
        offset = found.range.end;
    }
    output.push_str(&text[offset..]);
    Ok(output)
}
fn camel(name: &str, pascal: bool) -> String {
    let mut upper = pascal;
    let mut result = String::new();
    for character in name.chars() {
        if matches!(character, '-' | '_' | '/' | '.') {
            upper = true;
            continue;
        }
        result.push(if upper { character.to_ascii_uppercase() } else { character });
        upper = false;
    }
    result
}
pub(super) fn filename(name: &str, source: &str, target: &str) -> io::Result<String> {
    let path = name.replacen(source, target, 1);
    if std::path::Path::new(&path)
        .components()
        .any(|part| !matches!(part, std::path::Component::Normal(_)))
        || path.contains('\\')
    {
        return Err(unsupported("rename file path"));
    }
    Ok(path)
}
