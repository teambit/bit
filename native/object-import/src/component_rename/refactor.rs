//! Published ordered global replacements; binary component sources remain unchanged.
use super::{invalid, unsupported};
use regress::Regex;
use std::{
    borrow::Cow,
    collections::HashMap,
    io,
    sync::{Arc, Mutex, OnceLock},
};

type Compiled = Result<Arc<Regex>, String>;

/// Compilation is lazy so an invalid pattern still fails at the first text
/// source that uses it, after any earlier missing-file or binary-file checks.
#[derive(Default)]
pub(super) struct PatternCache(Mutex<HashMap<String, Arc<OnceLock<Compiled>>>>);
impl PatternCache {
    fn get(&self, pattern: &str) -> io::Result<Arc<Regex>> {
        let slot = Arc::clone(
            self.0
                .lock()
                .map_err(|_| invalid("rename pattern cache unavailable"))?
                .entry(pattern.to_owned())
                .or_insert_with(|| Arc::new(OnceLock::new())),
        );
        match slot.get_or_init(|| {
            Regex::new(pattern).map(Arc::new).map_err(|error| error.to_string())
        }) {
            Ok(regex) => Ok(Arc::clone(regex)),
            Err(error) => Err(invalid(error.clone())),
        }
    }
}

pub(crate) fn content(bytes: &[u8], source: &str, target: &str) -> io::Result<Vec<u8>> {
    ContentMatcher::new(source, target, Arc::new(PatternCache::default())).apply(bytes)
}

/// One rename plan keeps the three compiled replacements across all its files.
pub(super) struct ContentMatcher {
    patterns: [String; 3],
    targets: [String; 3],
    cache: Arc<PatternCache>,
}
impl ContentMatcher {
    pub(super) fn new(source: &str, target: &str, cache: Arc<PatternCache>) -> Self {
        Self {
            patterns: [source.into(), camel(source, false), camel(source, true)],
            targets: [target.into(), camel(target, false), camel(target, true)],
            cache,
        }
    }
    pub(super) fn apply(&self, bytes: &[u8]) -> io::Result<Vec<u8>> {
        if crate::checkout::eol::binary(bytes) {
            return Ok(bytes.to_vec());
        }
        let mut text = String::from_utf8_lossy(bytes).into_owned();
        for (old, new) in self.patterns.iter().zip(&self.targets) {
            if old == new
                && old
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
            {
                continue;
            }
            text = replace_compiled(&text, new, self.cache.get(old)?.as_ref());
        }
        Ok(text.into_bytes())
    }
}
pub(crate) fn package(bytes: &[u8], source: &str, target: &str) -> io::Result<Vec<u8>> {
    PackageMatcher::new(source, target).apply(bytes)
}
/// A phase-local matcher compiles only when its first nonbinary file is reached.
pub(super) struct PackageMatcher {
    source: String,
    target: String,
    regex: Option<Arc<Regex>>,
    cache: Option<Arc<PatternCache>>,
}
impl PackageMatcher {
    pub(super) fn new(source: &str, target: &str) -> Self {
        Self { source: source.into(), target: target.into(), regex: None, cache: None }
    }
    pub(super) fn with_cache(source: &str, target: &str, cache: Arc<PatternCache>) -> Self {
        Self { source: source.into(), target: target.into(), regex: None, cache: Some(cache) }
    }
    pub(super) fn apply(&mut self, bytes: &[u8]) -> io::Result<Vec<u8>> {
        Ok(self
            .apply_cow(Cow::Borrowed(bytes))?
            .into_owned())
    }
    fn apply_cow<'a>(&mut self, bytes: Cow<'a, [u8]>) -> io::Result<Cow<'a, [u8]>> {
        if crate::checkout::eol::binary(bytes.as_ref()) {
            return Ok(bytes);
        }
        if self.regex.is_none() {
            let pattern = format!(r#"{}(['"/])"#, self.source);
            self.regex = Some(match &self.cache {
                Some(cache) => cache.get(&pattern)?,
                None => Arc::new(Regex::new(&pattern).map_err(|error| invalid(error.to_string()))?),
            });
        }
        let regex = self.regex.as_ref().ok_or_else(|| invalid("package matcher unavailable"))?;
        let text = String::from_utf8_lossy(bytes.as_ref());
        let mut output: Option<String> = None;
        let mut offset = 0;
        for found in regex.find_iter(&text) {
            let result = output.get_or_insert_with(String::new);
            result.push_str(&text[offset..found.range.start]);
            result.push_str(&self.target);
            if let Some(suffix) = found.captures.first().and_then(Clone::clone) {
                result.push_str(&text[suffix]);
            }
            offset = found.range.end;
        }
        if let Some(mut result) = output {
            result.push_str(&text[offset..]);
            return Ok(Cow::Owned(result.into_bytes()));
        }
        match text {
            Cow::Borrowed(_) => Ok(bytes),
            Cow::Owned(normalized) => Ok(Cow::Owned(normalized.into_bytes())),
        }
    }
}
pub(super) struct PackageMatchers(Vec<PackageMatcher>);
impl PackageMatchers {
    #[cfg(test)]
    pub(super) fn new(pairs: &[(String, String)]) -> Self {
        Self(
            pairs
                .iter()
                .map(|(source, target)| PackageMatcher::new(source, target))
                .collect(),
        )
    }
    pub(super) fn with_cache(pairs: &[(String, String)], cache: &Arc<PatternCache>) -> Self {
        Self(
            pairs
                .iter()
                .map(|(source, target)| {
                    PackageMatcher::with_cache(source, target, Arc::clone(cache))
                })
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
        let mut output = Cow::Borrowed(bytes);
        for matcher in &mut self.0 {
            output = matcher.apply_cow(output)?;
        }
        Ok(output.into_owned())
    }
}

fn replace(text: &str, old: &str, new: &str) -> io::Result<String> {
    let regex = Regex::new(old).map_err(|error| invalid(error.to_string()))?;
    Ok(replace_compiled(text, new, &regex))
}
fn replace_compiled(text: &str, new: &str, regex: &Regex) -> String {
    let mut output = String::new();
    let mut offset = 0;
    for found in regex.find_iter(text) {
        output.push_str(&text[offset..found.range.start]);
        output.push_str(new);
        offset = found.range.end;
    }
    output.push_str(&text[offset..]);
    output
}
fn camel(name: &str, pascal: bool) -> String {
    let mut upper = pascal;
    let mut result = String::new();
    for character in name.chars() {
        if matches!(character, '-' | '_' | '/' | '.') {
            upper = pascal || !result.is_empty();
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
