//! Unit tests for `bit system` [`Parsed`] CLI subcommand parsing ([`parse_args`]) and unrecognized-subcommand errors ([`format_unrecognized`]).
//!
//! Verifies `log` subcommand recognition, `--help` / `--json` rejection, and [`Chalk`] error output.

use super::{Chalk, Parsed, format_unrecognized, parse_args};
use std::ffi::OsString;

/// Verifies `bit system` [`Parsed`] subcommand parsing via [`parse_args`].
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

/// Verifies that [`format_unrecognized`] formats the standard unrecognized `bit system` subcommand message.
#[test]
fn formats_unrecognized_system_subcommand() {
    let message = format_unrecognized("unknown", Chalk::new(false));
    assert_eq!(
        message,
        r#""unknown" is not a subcommand of "system", please run "bit system --help" to list the subcommands"#,
    );
}

/// Verifies that [`parse_args`] returns `None` when given an empty argument slice.
#[test]
fn empty_slice_returns_none_for_system_command() {
    assert_eq!(parse_args(&[]), None);
}
