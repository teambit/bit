//! Published ordered global replacements; binary component sources remain unchanged.
use super::{invalid, unsupported};
use regress::Regex;
use std::io;

pub(crate) fn content(bytes: &[u8], source: &str, target: &str) -> io::Result<Vec<u8>> {
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
pub(crate) fn package(bytes: &[u8], source: &str, target: &str) -> io::Result<Vec<u8>> {
    PackageMatcher::new(source, target).apply(bytes)
}
/// A phase-local matcher compiles only when its first nonbinary file is reached.
pub(super) struct PackageMatcher {
    source: String,
    target: String,
    regex: Option<Regex>,
}
impl PackageMatcher {
    pub(super) fn new(source: &str, target: &str) -> Self {
        Self { source: source.into(), target: target.into(), regex: None }
    }
    pub(super) fn apply(&mut self, bytes: &[u8]) -> io::Result<Vec<u8>> {
        if crate::checkout::eol::binary(bytes) {
            return Ok(bytes.to_vec());
        }
        if self.regex.is_none() {
            self.regex = Some(
                Regex::new(&format!(r#"{}(['"/])"#, self.source))
                    .map_err(|error| invalid(error.to_string()))?,
            );
        }
        let regex = self.regex.as_ref().ok_or_else(|| invalid("package matcher unavailable"))?;
        let text = String::from_utf8_lossy(bytes);
        let mut output = String::new();
        let mut offset = 0;
        for found in regex.find_iter(&text) {
            output.push_str(&text[offset..found.range.start]);
            output.push_str(&self.target);
            if let Some(suffix) = found.captures.first().and_then(Clone::clone) {
                output.push_str(&text[suffix]);
            }
            offset = found.range.end;
        }
        output.push_str(&text[offset..]);
        Ok(output.into_bytes())
    }
}
pub(super) struct PackageMatchers(Vec<PackageMatcher>);
impl PackageMatchers {
    pub(super) fn new(pairs: &[(String, String)]) -> Self {
        Self(
            pairs
                .iter()
                .map(|(source, target)| PackageMatcher::new(source, target))
                .collect(),
        )
    }
    pub(super) fn matches(&self, pairs: &[(String, String)]) -> bool {
        self.0.len() == pairs.len()
            && self.0
                .iter()
                .zip(pairs)
                .all(|(matcher, (source, target))| {
                    matcher.source == *source && matcher.target == *target
                })
    }
    pub(super) fn apply(&mut self, bytes: &[u8]) -> io::Result<Vec<u8>> {
        let mut output = bytes.to_vec();
        for matcher in &mut self.0 {
            output = matcher.apply(&output)?;
        }
        Ok(output)
    }
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
pub(crate) fn filename(name: &str, source: &str, target: &str) -> io::Result<String> {
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

/// The global regex replacement used by replaceMultipleStrings, preserving binary files.
pub(crate) fn replace_bytes(bytes: &[u8], source: &str, target: &str) -> io::Result<Vec<u8>> {
    if crate::checkout::eol::binary(bytes) {
        return Ok(bytes.to_vec());
    }
    Ok(replace(&String::from_utf8_lossy(bytes), source, target)?.into_bytes())
}
