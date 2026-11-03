//! Unit tests for `node-ignore` 3.3.10 regex generation ([`parts`], [`source`]) and path filtering ([`Ignore`])
//! against [`golden`] cases in `bit-install` file discovery ([`regex_sources_match_node_ignore`], [`filters_match_node_ignore`]).

/// Golden `node-ignore` 3.3.10 regex and path filter fixtures.
mod golden;

use super::{Ignore, parts, source};
use pretty_assertions::assert_eq;

/// Verifies that compiled positive and negative regex [`source`] strings match `node-ignore` 3.3.10 [`golden`] outputs.
#[test]
fn regex_sources_match_node_ignore() {
    for (pattern, positive, negative) in golden::REGEXES {
        let (_, body) = parts(pattern);
        assert_eq!(source(&body, false), *positive, "{pattern}");
        let (negated, body) = parts(&format!("!{pattern}"));
        assert!(negated);
        assert_eq!(source(&body, true), *negative, "!{pattern}");
    }
}

/// Verifies that [`Ignore::filter`] matches `node-ignore` 3.3.10 [`golden`] path filter results.
#[test]
fn filters_match_node_ignore() {
    let paths: Vec<String> = golden::PATHS
        .iter()
        .map(|path| (*path).to_owned())
        .collect();
    for (rules, expected) in golden::FILTERS {
        let mut ignore = Ignore::new();
        ignore.add(rules.iter()).unwrap();
        assert_eq!(ignore.filter(&paths), *expected, "{rules:?}");
    }
}

/// Verifies that [`Ignore::extend`] appends rules, resets cached state, and handles empty or prototype keys safely.
#[test]
fn extend_appends_rules_and_resets_the_cache() {
    let mut base = Ignore::new();
    base.add(["*.log"]).unwrap();
    assert!(base.ignores("a.log"));
    let mut negation = Ignore::new();
    negation.add(["!a.log"]).unwrap();
    base.extend(&negation);
    assert!(!base.ignores("a.log"));
    assert!(Ignore::new().is_empty());
    assert!(!base.ignores("constructor"));
    assert!(base.ignores(""));
}
