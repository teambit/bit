use super::{match_queries, parse_args};
use serde_json::json;
use std::ffi::OsString;

fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

#[test]
fn parses_search_flags() {
    let parsed = parse_args(&os_args(&["search", "foo", "bar", "--local-only", "--json"])).unwrap();
    assert_eq!(parsed.queries, vec!["foo", "bar"]);
    assert!(parsed.local_only);
    assert!(!parsed.remote_only);
    assert!(parsed.json);
}

#[test]
fn parses_short_flags() {
    let parsed = parse_args(&os_args(&["search", "foo", "-l", "-j"])).unwrap();
    assert_eq!(parsed.queries, vec!["foo"]);
    assert!(parsed.local_only);
    assert!(parsed.json);
}

#[test]
fn rejects_unsupported_flags() {
    assert!(parse_args(&os_args(&["search", "--owners", "my-org"])).is_none());
    assert!(parse_args(&os_args(&["search", "--invalid"])).is_none());
}

#[test]
fn matches_queries_case_insensitively_and_deduplicates() {
    let ids = vec!["my-scope/bar/foo".to_owned(), "my-scope/utils/is-type".to_owned()];
    let (all, per_query) = match_queries(&ids, &["FOO".to_owned(), "bar".to_owned()]);
    assert_eq!(all, vec!["my-scope/bar/foo".to_owned()]);
    assert_eq!(per_query.len(), 2);
    assert_eq!(per_query[0]["localCount"], json!(1));
    assert_eq!(per_query[1]["localCount"], json!(1));
}
