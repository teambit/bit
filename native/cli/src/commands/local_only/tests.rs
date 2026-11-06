//! Unit tests for `bit local-only` [`Subcommand`] CLI parsing ([`parse_subcommand`]).
//!
//! Verifies `set`, `unset`, `list`, and unrecognized [`Subcommand`] argument parsing in [`parse_subcommand`].

use super::{Subcommand, parse_subcommand};
use std::ffi::OsString;

/// Converts string slices into owned [`OsString`] CLI arguments for `local-only` tests.
fn args(items: &[&str]) -> Vec<OsString> {
    items
        .iter()
        .map(OsString::from)
        .collect()
}

/// Verifies [`parse_subcommand`] with [`args`] for `bit local-only` across `set`, `unset`, `list`, and unrecognized [`Subcommand`]s.
///
/// Also checks that `--help` returns `None` so help rendering is delegated.
#[test]
fn parses_set_unset_list_and_unrecognized_subcommands() {
    assert_eq!(
        parse_subcommand(&args(&["local-only", "set", "comp1"])),
        Some(Subcommand::Set("comp1".to_owned())),
    );
    assert_eq!(
        parse_subcommand(&args(&["local-only", "unset", "comp*"])),
        Some(Subcommand::Unset("comp*".to_owned())),
    );
    assert_eq!(
        parse_subcommand(&args(&["local-only", "set", "teambit.scope/comp1"])),
        Some(Subcommand::Set("teambit.scope/comp1".to_owned())),
    );
    assert_eq!(parse_subcommand(&args(&["local-only", "list"])), Some(Subcommand::List));
    assert_eq!(
        parse_subcommand(&args(&["local-only", "foo"])),
        Some(Subcommand::Unrecognized("foo".to_owned())),
    );
    assert_eq!(parse_subcommand(&args(&["local-only", "--help"])), None);
}

/// Verifies that [`parse_subcommand`] returns `None` when given an empty slice or bare `local-only`.
///
/// Ensures missing subcommands decline so the CLI help/usage path handles them.
#[test]
fn empty_args_or_missing_subcommand_returns_none_for_local_only() {
    assert_eq!(parse_subcommand(&[]), None);
    assert_eq!(parse_subcommand(&args(&["local-only"])), None);
}
