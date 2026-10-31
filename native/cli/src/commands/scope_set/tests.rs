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
fn parses_workspace_and_component_scope_set() {
    assert_eq!(
        parse(&["scope", "set", "org.my-scope"]),
        Some(Options { scope_name: "org.my-scope".to_owned(), pattern: None }),
    );
    assert_eq!(
        parse(&["scope", "set", "org.my-scope", "comp1"]),
        Some(Options { scope_name: "org.my-scope".to_owned(), pattern: Some("comp1".to_owned()) }),
    );
}

#[test]
fn declines_unsupported_scope_set_arguments() {
    assert_eq!(parse(&["scope", "set"]), None);
    assert_eq!(parse(&["scope", "set", "org.scope", "--help"]), None);
    assert_eq!(parse(&["scope", "set", "org.scope", "$modified"]), None);
    assert_eq!(parse(&["scope", "set", "org.scope", "comp1", "extra"]), None);
}
