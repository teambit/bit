//! Unit tests for `bit remote` [`Action`] and [`Options`] CLI subcommand parsing and URL validation.
//!
//! Verifies `list`, `add`, and `del` subcommands and `--global` flag handling.

use super::options::{Action, Options};
use std::ffi::OsString;

/// Parses `words` as [`OsString`] CLI arguments through [`Options::parse`].
fn parse(words: &[&str]) -> Option<Options> {
    let args = words
        .iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    Options::parse(&args)
}

/// Verifies [`parse`] into [`Options`] and [`Action`] for `bit remote` CLI subcommands covering `list`, default `remote`, and `--global` / `-g`.
#[test]
fn parses_list_and_default_subcommand() {
    assert_eq!(
        parse(&["remote"]),
        Some(Options { command: "remote", action: Action::List, global: false }),
    );
    assert_eq!(
        parse(&["remote", "--global"]),
        Some(Options { command: "remote", action: Action::List, global: true }),
    );
    assert_eq!(
        parse(&["remote", "list", "-g"]),
        Some(Options { command: "list", action: Action::List, global: true }),
    );
}

/// Verifies `bit remote` CLI parsing for `add` and `del` subcommands with `--global`.
#[test]
fn parses_add_and_del_subcommands() {
    assert_eq!(
        parse(&["remote", "add", "file:///tmp/scope", "--global"]),
        Some(Options {
            command: "add",
            action: Action::Add("file:///tmp/scope".to_owned()),
            global: true,
        }),
    );
    assert_eq!(
        parse(&["remote", "del", "my-scope"]),
        Some(Options { command: "del", action: Action::Del("my-scope".to_owned()), global: false }),
    );
}

/// Verifies that [`Options::parse`] declines `--help`, HTTP URLs, missing arguments, and unknown subcommands.
#[test]
fn declines_unsupported_remote_arguments() {
    assert_eq!(parse(&["remote", "--help"]), None);
    assert_eq!(parse(&["remote", "add", "http://localhost:3000"]), None);
    assert_eq!(parse(&["remote", "add"]), None);
    assert_eq!(parse(&["remote", "del"]), None);
    assert_eq!(parse(&["remote", "unknown"]), None);
}

/// Verifies that [`Options::parse`] defaults to [`Action::List`] on `"remote"` when given an empty argument slice.
#[test]
fn empty_args_slice_defaults_to_remote_list_action() {
    assert_eq!(
        parse(&[]),
        Some(Options { command: "remote", action: Action::List, global: false }),
    );
}
