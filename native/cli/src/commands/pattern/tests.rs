use super::{Options, parse_options};
use std::ffi::OsString;

fn parse(words: &[&str]) -> Option<Options> {
    let args = words
        .iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    parse_options(&args)
}

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
}

#[test]
fn declines_stateful_or_invalid_arguments() {
    assert_eq!(parse(&["pattern"]), None);
    assert_eq!(parse(&["pattern", "$modified"]), None);
    assert_eq!(parse(&["pattern", "$env:teambit.react/react"]), None);
    assert_eq!(parse(&["pattern", "**", "extra"]), None);
    assert_eq!(parse(&["pattern", "**", "--help"]), None);
}
