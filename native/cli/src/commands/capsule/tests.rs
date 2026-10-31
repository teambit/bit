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
    assert!(matches!(parse_subcommand(&["prune", "--json"]), Some(Subcommand::Prune(_))));
    assert_eq!(
        parse_subcommand(&["create", "--seeders-only", "comp1", "-j"]),
        Some(Subcommand::Create(CreateArgs {
            ids: vec!["comp1".into()],
            seeders_only: true,
            json: true,
            base_dir: None,
            always_new: false,
            name: None,
            root_base_dir: None,
            use_hash: false,
        })),
    );
    assert_eq!(
        parse_subcommand(&["create", "comp1", "--base-dir", "custom"]),
        Some(Subcommand::Create(CreateArgs {
            ids: vec!["comp1".into()],
            seeders_only: false,
            json: false,
            base_dir: Some("custom".into()),
            always_new: false,
            name: None,
            root_base_dir: None,
            use_hash: false,
        })),
    );
    assert!(matches!(
        parse_subcommand(&["create", "comp1", "--id", "custom"]),
        Some(Subcommand::Create(CreateArgs { name: Some(name), .. })) if name == "custom"
    ));
    assert!(matches!(
        parse_subcommand(&["create", "comp1", "-a"]),
        Some(Subcommand::Create(CreateArgs { always_new: true, .. }))
    ));
    assert!(matches!(
        parse_subcommand(&[
            "create",
            "comp1",
            "--id=custom",
            "--base-dir=sub",
            "--json=true",
            "--no-color",
        ]),
        Some(Subcommand::Create(CreateArgs {
            json: true,
            name: Some(name),
            base_dir: Some(base),
            ..
        })) if name == "custom" && base == "sub"
    ));
    assert!(matches!(parse_subcommand(&["prune"]), Some(Subcommand::Prune(_))));
}

#[test]
fn matches_object_hash_short_sha1() {
    assert_eq!(object_hash_short("/tmp/test-ws"), "4d90daa1e");
}
