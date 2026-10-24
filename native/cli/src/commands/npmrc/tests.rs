use super::parse_subcommand;
use std::ffi::OsString;

fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

#[test]
fn parses_subcommand() {
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "foo"])), Some("foo".to_owned()));
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "generate"])), Some("generate".to_owned()));
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "bar", "--no-color"])), Some("bar".to_owned()));
}

#[test]
fn rejects_flags_or_missing_subcommand() {
    assert_eq!(parse_subcommand(&os_args(&["npmrc"])), None);
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "--help"])), None);
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "-h"])), None);
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "a", "b"])), None);
}
