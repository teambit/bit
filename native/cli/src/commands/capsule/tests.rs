use super::{Subcommand, create::CreateArgs, object_hash_short, parse_subcommand};

#[test]
fn parses_capsule_subcommands() {
    assert_eq!(parse_subcommand(&[]), Some(Subcommand::BareList));
    assert_eq!(
        parse_subcommand(&["list"]),
        Some(Subcommand::List { json: false, with_stats: false }),
    );
    assert_eq!(
        parse_subcommand(&["list", "--json"]),
        Some(Subcommand::List { json: true, with_stats: false }),
    );
    assert_eq!(
        parse_subcommand(&["delete", "--scope-aspects"]),
        Some(Subcommand::Delete { all: false, scope_aspects: true }),
    );
    assert_eq!(
        parse_subcommand(&["delete", "-a"]),
        Some(Subcommand::Delete { all: true, scope_aspects: false }),
    );
    assert_eq!(
        parse_subcommand(&["list", "--with-stats"]),
        Some(Subcommand::List { json: false, with_stats: true }),
    );
    assert!(matches!(
        parse_subcommand(&["prune", "--dry-run", "--with-sizes", "--json"]),
        Some(Subcommand::Prune(_)),
    ));
    assert_eq!(parse_subcommand(&["prune", "--json"]), None);
    assert_eq!(
        parse_subcommand(&["create", "--seeders-only", "comp1", "-j"]),
        Some(Subcommand::Create(CreateArgs {
            ids: vec!["comp1".into()],
            seeders_only: true,
            json: true,
        })),
    );
    assert_eq!(parse_subcommand(&["prune"]), None);
}

#[test]
fn matches_object_hash_short_sha1() {
    assert_eq!(object_hash_short("/tmp/test-ws"), "4d90daa1e");
}
