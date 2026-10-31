use super::{Subcommand, parse_positive_int, parse_subcommand};

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
