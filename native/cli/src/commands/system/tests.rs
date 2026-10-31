use super::{Chalk, Parsed, format_unrecognized, parse_args};
use std::ffi::OsString;

#[test]
fn parses_system_subcommands() {
    assert_eq!(parse_args(&[OsString::from("system"), OsString::from("log")]), Some(Parsed::Log));
    assert_eq!(
        parse_args(&[OsString::from("system"), OsString::from("foo")]),
        Some(Parsed::Unrecognized("foo".to_owned())),
    );
    assert_eq!(parse_args(&[OsString::from("system")]), None);
    assert_eq!(parse_args(&[OsString::from("system"), OsString::from("--help")]), None);
    assert_eq!(parse_args(&[OsString::from("system"), OsString::from("tail-log")]), None);
    assert_eq!(
        parse_args(&[OsString::from("system"), OsString::from("log"), OsString::from("--json")]),
        None,
    );
}

#[test]
fn formats_unrecognized_system_subcommand() {
    let message = format_unrecognized("unknown", Chalk::new(false));
    assert_eq!(
        message,
        r#""unknown" is not a subcommand of "system", please run "bit system --help" to list the subcommands"#,
    );
}
