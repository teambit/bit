//! Component id patterns (`component-id-patterns.ts`): `splitComponentPatterns`
//! and `matchComponentPatterns`, which runs `multimatch` 5 with `minimatch`
//! 3.1.5 over the ids. The globs `*`, `?` and `**` and `!` negation are
//! ported; classes, braces and extglobs are left to Node.
//!
//! Exposes [`split`], [`matching`], [`supported`], [`match_segments`], and [`extended`] for comma, version, and brace-expanded pattern matching.

pub mod extended;

#[cfg(test)]
mod oracle_tests;
#[cfg(test)]
mod patterns_tests;

use super::status::js::decline;
use std::io;

/// Splits `pattern` (`splitComponentPatterns(pattern)`) on commas, trims each part, and prepends `**` when every part is negated.
#[must_use]
#[inline]
pub fn split(pattern: &str) -> Vec<String> {
    let mut patterns: Vec<String> = pattern
        .split(',')
        .map(|part| part.trim().to_string())
        .collect();
    if !patterns.is_empty()
        && patterns
            .iter()
            .all(|part| part.starts_with('!'))
    {
        patterns.insert(0, "**".to_string());
    }
    patterns
}

/// `matchComponentPatterns(identities, patterns)`: the ids, in their order,
/// whose last matching pattern is not negated. A pattern's `@version` is
/// ignored, validating globs via [`supported`] and [`match_segments`].
pub fn matching<'i>(identities: &[&'i str], patterns: &[String]) -> io::Result<Vec<&'i str>> {
    let globs = patterns
        .iter()
        .map(|pattern| {
            let pattern = pattern
                .trim()
                .split('@')
                .next()
                .unwrap_or_default()
                .trim();
            let (negated, glob) = pattern
                .strip_prefix('!')
                .map_or((false, pattern), |glob| (true, glob.trim()));
            supported(glob)?;
            Ok((negated, glob.split('/').collect::<Vec<_>>()))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if globs.is_empty() || identities.is_empty() {
        return Ok(Vec::new());
    }
    Ok(identities
        .iter()
        .copied()
        .filter(|identity| {
            let path: Vec<&str> = identity.trim().split('/').collect();
            globs
                .iter()
                .fold(
                    false,
                    |kept, (negated, glob)| {
                        if match_segments(&path, glob) { !negated } else { kept }
                    },
                )
        })
        .collect())
}

/// Validates that `glob` uses only the natively ported glob grammar (`*`, `?`, `**`) or declines via [`decline`].
#[inline]
fn supported(glob: &str) -> io::Result<()> {
    if glob.is_empty()
        || glob.starts_with('#')
        || glob.contains(['[', ']', '{', '}', '(', ')', '+', '!', '\\', '@', '$', ':'])
    {
        return Err(decline("component pattern outside the native glob grammar"));
    }
    Ok(())
}

/// `minimatch(path, glob)`: segment by segment, `**` spanning any number of
/// segments, neither matching a dot segment ([`match_segment`]).
fn match_segments(path: &[&str], glob: &[&str]) -> bool {
    let Some((first, rest)) = glob.split_first() else { return path.is_empty() };
    if *first == "**" {
        // Zero segments, or one more segment that is not a dot segment.
        return match_segments(path, rest)
            || path
                .split_first()
                .is_some_and(|(segment, others)| {
                    !segment.starts_with('.') && match_segments(others, glob)
                });
    }
    path.split_first()
        .is_some_and(|(segment, others)| {
            match_segment(segment, first) && match_segments(others, rest)
        })
}

/// One segment: `*` any run, `?` one character; a glob with either does not
/// match a dot segment unless it starts with a dot itself, and `*` alone
/// needs a non-empty segment.
#[inline]
fn match_segment(segment: &str, glob: &str) -> bool {
    let magic = glob.contains(['*', '?']);
    if !magic {
        return segment == glob;
    }
    if segment.starts_with('.') && !glob.starts_with('.') || segment.is_empty() {
        return false;
    }
    let segment: Vec<char> = segment.chars().collect();
    let glob: Vec<char> = glob.chars().collect();
    wildcard(&segment, &glob)
}

#[inline]
fn wildcard(text: &[char], glob: &[char]) -> bool {
    match glob.split_first() {
        None => text.is_empty(),
        Some(('*', rest)) => (0..=text.len()).any(|skip| wildcard(&text[skip..], rest)),
        Some(('?', rest)) => !text.is_empty() && wildcard(&text[1..], rest),
        Some((literal, rest)) => text.first() == Some(literal) && wildcard(&text[1..], rest),
    }
}
