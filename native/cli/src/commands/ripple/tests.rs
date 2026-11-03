//! Unit tests for `bit ripple` [`Subcommand`] CLI parsing ([`parse_subcommand`]) and positive integer limit validation ([`parse_positive_int`]).
//!
//! Verifies `list`, `simulate`, and `retry` [`Subcommand`]s and invalid `--limit` detection in [`parse_positive_int`].

use super::{Subcommand, parse_positive_int, parse_subcommand};

/// Verifies bare `bit ripple` [`Subcommand`] CLI parsing via [`parse_subcommand`] and [`parse_positive_int`].
///
/// Covers `list --limit`, `simulate --lane`, `retry -j`, and non-positive integer rejection.
#[test]
fn parses_bare_ripple_and_invalid_limit() {
    assert_eq!(parse_subcommand(&[]), Some(Subcommand::Bare));
    assert_eq!(
        parse_subcommand(&["list", "--limit", "0"]),
        Some(Subcommand::ListInvalidLimit { raw: "0".into(), json: false }),
    );
    assert_eq!(
        parse_subcommand(&["list", "-l", "abc", "-j"]),
        Some(Subcommand::ListInvalidLimit { raw: "abc".into(), json: true }),
    );
    assert_eq!(parse_subcommand(&["list", "--limit", "10"]), None);
    assert_eq!(
        parse_subcommand(&["simulate", "--lane", "org.scope/dev", "--json"]),
        Some(Subcommand::Simulate { lane: Some("org.scope/dev".into()), json: true }),
    );
    assert_eq!(
        parse_subcommand(&["retry", "-j"]),
        Some(Subcommand::NoArgJobOp { sub: "retry", json: true }),
    );
    assert_eq!(parse_positive_int("1"), Some(1));
    assert_eq!(parse_positive_int("0"), None);
    assert_eq!(parse_positive_int("-5"), None);
}

/// Verifies that [`parse_subcommand`] parses `simulate` into [`Subcommand::Simulate`] without a `--lane` flag.
///
/// Ensures `bit ripple simulate` defaults `lane` to `None` and `json` to `false`.
#[test]
fn parses_simulate_without_lane_flag() {
    assert_eq!(
        parse_subcommand(&["simulate"]),
        Some(Subcommand::Simulate { lane: None, json: false }),
    );
}
