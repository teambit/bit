//! Unit tests for `bit pattern` [`Options`] CLI argument parsing ([`parse_options`]) and stateful selector rejection.
//!
//! Verifies `--remote`, `--json`, and rejection of `$`-prefixed state selectors with `--remote`.

use super::{Options, parse_options};
use std::ffi::OsString;

/// Parses `words` as [`OsString`] CLI arguments through [`parse_options`].
fn parse(words: &[&str]) -> Option<Options> {
    let args = words
        .iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    parse_options(&args)
}

/// Verifies `bit pattern` argument parsing across local globs, `--remote`, and `-j`.
#[test]
fn parses_pattern_and_flags() {
    assert_eq!(
        parse(&["pattern", "**"]),
        Some(Options { pattern: "**".to_owned(), json: false, remote: false }),
    );
    assert_eq!(
        parse(&["pattern", "scope/**", "--remote", "-j"]),
        Some(Options { pattern: "scope/**".to_owned(), json: true, remote: true }),
    );
    assert_eq!(
        parse(&["pattern", "$modified", "--remote"]),
        Some(Options { pattern: "$modified".to_owned(), json: false, remote: true }),
    );
}

#[test]
fn declines_stateful_or_invalid_arguments() {
    assert_eq!(parse(&["pattern"]), None);
    assert_eq!(parse(&["pattern", "$modified"]), None);
    assert_eq!(parse(&["pattern", "$env:teambit.react/react"]), None);
    assert_eq!(parse(&["pattern", "**", "extra"]), None);
    assert_eq!(parse(&["pattern", "**", "--help"]), None);
}

#[test]
fn accepts_double_dash_before_pattern_argument() {
    assert_eq!(
        parse(&["pattern", "-j", "--", "ui/*"]),
        Some(Options { pattern: "ui/*".to_owned(), json: true, remote: false }),
    );
}
