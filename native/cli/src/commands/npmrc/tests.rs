//! Unit tests for `bit npmrc` CLI subcommand parsing ([`parse_subcommand`]).
//!
//! Verifies positional subcommand extraction and rejection of missing or flag arguments.

use super::parse_subcommand;
use std::ffi::OsString;

/// Converts string slices into owned [`OsString`] CLI arguments for `npmrc` tests.
fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

/// Verifies that [`parse_subcommand`] extracts the positional subcommand from [`os_args`] and ignores `--no-color`.
#[test]
fn parses_subcommand() {
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "foo"])), Some("foo".to_owned()));
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "generate"])), Some("generate".to_owned()));
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "bar", "--no-color"])), Some("bar".to_owned()));
}

/// Verifies that [`parse_subcommand`] rejects missing subcommands, `--help` flags, and extra positionals.
#[test]
fn rejects_flags_or_missing_subcommand() {
    assert_eq!(parse_subcommand(&os_args(&["npmrc"])), None);
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "--help"])), None);
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "-h"])), None);
    assert_eq!(parse_subcommand(&os_args(&["npmrc", "a", "b"])), None);
}

/// Verifies that [`parse_subcommand`] returns `None` when given an empty argument slice.
///
/// Ensures missing argv tokens decline native `bit npmrc` handling cleanly.
#[test]
fn empty_slice_returns_none_for_npmrc() {
    assert_eq!(parse_subcommand(&[]), None);
}
