//! Unit tests for `bit local-only` subcommand parsing.

use super::{Subcommand, parse_subcommand};
use std::ffi::OsString;

fn args(items: &[&str]) -> Vec<OsString> {
    items
        .iter()
        .map(OsString::from)
        .collect()
}

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

#[test]
fn empty_args_or_missing_subcommand_returns_none_for_local_only() {
    assert_eq!(parse_subcommand(&[]), None);
    assert_eq!(parse_subcommand(&args(&["local-only"])), None);
}
