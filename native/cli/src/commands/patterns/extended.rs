//! Read-only `multimatch` selection with the shared native minimatch grammar.
//! Bit splits commas and `@` versions before matching, even inside globs.

mod ranges;
#[cfg(test)]
mod tests;

use bit_install::dependencies::glob;
use std::io;

/// `multimatch` visits ids before patterns, preserving input order. The last
/// matching include/exclude decides whether each id remains in the result.
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
                .map_or((false, pattern), |pattern| (true, pattern));
            Ok((negated, ranges::expand(pattern)?))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(identities
        .iter()
        .copied()
        .filter(|id| {
            compiled
                .iter()
                .fold(false, |selected, (negated, patterns)| {
                    if patterns.iter().any(|pattern| matches(id, pattern)) {
                        !negated
                    } else {
                        selected
                    }
                })
        })
        .collect())
}

fn matches(identity: &str, pattern: &str) -> bool {
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern.starts_with('#') {
        return false;
    }
    let positive = pattern.trim_start_matches('!');
    let negated = (pattern.len() - positive.len()) % 2 == 1;
    let matched = glob::matches(positive, identity);
    matched != negated
}
