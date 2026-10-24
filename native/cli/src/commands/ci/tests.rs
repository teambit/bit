use super::{
    Subcommand, SyncOptions, merge::MergeOptions, parse_subcommand, validate_sync_options,
};

#[test]
fn parses_ci_subcommands_and_validates_sync_flags() {
    assert_eq!(parse_subcommand(&[]), Some(Subcommand::Bare));
    assert_eq!(parse_subcommand(&["verify"]), Some(Subcommand::Verify));
    assert_eq!(
        parse_subcommand(&["merge", "-r", "invalid"]),
        Some(Subcommand::Merge(MergeOptions {
            auto_merge_resolve: Some("invalid".into()),
            ..MergeOptions::default()
        })),
    );
    assert_eq!(
        parse_subcommand(&["sync", "--init", "--main"]),
        Some(Subcommand::Sync(SyncOptions {
            lane: None,
            branch: None,
            all: false,
            main: true,
            dry_run: false,
            init: true,
        })),
    );
    let err_init = validate_sync_options(&SyncOptions {
        lane: None,
        branch: None,
        all: false,
        main: true,
        dry_run: false,
        init: true,
    })
    .expect_err("init with main should fail");
    assert!(err_init.contains("bit ci sync --init cannot be combined"));

    let err_all = validate_sync_options(&SyncOptions {
        lane: Some("feat".into()),
        branch: None,
        all: true,
        main: false,
        dry_run: false,
        init: false,
    })
    .expect_err("all with lane should fail");
    assert!(err_all.contains(r#"--all cannot be combined with a lane argument ("feat")"#));

    let err_multi = validate_sync_options(&SyncOptions {
        lane: Some("feat".into()),
        branch: None,
        all: false,
        main: true,
        dry_run: false,
        init: false,
    })
    .expect_err("lane with main should fail");
    assert!(err_multi.contains(r#"a lane argument ("feat") cannot be combined with --main"#));
}
