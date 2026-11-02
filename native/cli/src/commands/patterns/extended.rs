//! Read-only `multimatch` selection with the shared native minimatch grammar.
//! Bit splits commas and `@` versions before matching, even inside globs.
//!
//! [`matching`] and [`matches`] use [`glob`] and [`ranges`] expansion to evaluate multi-clause component patterns.

mod ranges;
#[cfg(test)]
mod tests;

use bit_install::dependencies::glob;
use std::io;

/// Filters `identities` against `patterns` using `multimatch` evaluation order (ids outer, patterns inner, last matching clause wins).
pub fn matching<'i>(identities: &[&'i str], patterns: &[String]) -> io::Result<Vec<&'i str>> {
    let compiled = patterns
        .iter()
        .map(|pattern| {
            let pattern = pattern
                .trim()
                .split('@')
                .next()
                .unwrap_or_default()
                .trim();
            let (negated, pattern) = pattern
                .strip_prefix('!')
                .map_or((false, pattern), |pattern| (true, pattern.trim()));
            Ok((negated, ranges::expand(pattern)?))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if compiled.is_empty() || identities.is_empty() {
        return Ok(Vec::new());
    }
    Ok(identities
        .iter()
        .copied()
        .filter(|id| {
            let trimmed_id = id.trim();
            compiled
                .iter()
                .fold(false, |selected, (negated, patterns)| {
                    if patterns.iter().any(|pattern| matches(trimmed_id, pattern)) {
                        !negated
                    } else {
                        selected
                    }
                })
        })
        .collect())
}

/// Returns whether `identity` matches a single `pattern` clause via [`glob::matches`] after leading `!` negations.
#[inline]
fn matches(identity: &str, pattern: &str) -> bool {
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern.starts_with('#') {
        return false;
    }
    let stripped = pattern.trim_start_matches('!');
    let negated = (pattern.len() - stripped.len()) % 2 == 1;
    let positive = stripped.trim();
    if positive.is_empty() || positive.starts_with('#') {
        return false;
    }
    let matched = glob::matches(positive, identity);
    matched != negated
}
