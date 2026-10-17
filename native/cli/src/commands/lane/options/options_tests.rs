use super::parse;
use serde_json::json;

#[test]
fn lane_merges_with_their_options() {
    assert!(!parse(&["dev", "--no-snap"]).unwrap().skip_install);
    assert!(!parse(&["dev"]).unwrap().skip_install);
    let options = parse(&["dev", "remote/two", "-x", "--no-squash", "-r", "theirs"]).unwrap();
    assert_eq!(
        options.request(),
        json!({
            "lane": { "name": "dev", "noAutoSnap": false, "noSquash": true, "squash": false, "skipFetch": false,
                "includeDeps": false, "workspaceOnly": false, "excludeNonLaneComps": false },
            "pattern": "remote/two", "strategy": "theirs", "noSnap": false, "verbose": false, "skipDependencyInstallation": true,
        }),
    );
    assert_eq!(
        parse(&["remote/dev", "--pattern", "remote/*", "-x"]).unwrap().pattern.as_deref(),
        Some("remote/*"),
    );
}

#[test]
fn other_lane_merges_are_left_to_node() {
    for args in [
        &["dev", "-x", "--squash", "--no-squash"][..],
        &["dev", "-x", "--manual", "-r", "ours"],
        &["dev", "-x", "--no-auto-snap", "-m", "x"],
        &["dev", "-x", "--include-deps"],
        &["Dev", "-x"],
        &["dev", "a", "b", "-x"],
        &["dev", "a", "--pattern", "b", "-x"],
        &["dev", "-x", "--build"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}

#[test]
fn unrelated_resolution_defaults_and_both_valued_spellings() {
    for args in
        [vec!["dev", "--resolve-unrelated", "-x"], vec!["dev", "--resolve-unrelated", "ours"]]
    {
        assert_eq!(parse(&args).unwrap().resolve_unrelated.as_deref(), Some("ours"));
    }
    let options = parse(&["dev", "--resolve-unrelated=theirs"]).unwrap();
    assert_eq!(options.request()["lane"]["resolveUnrelated"], "theirs");
    assert!(parse(&["dev", "--resolve-unrelated=invalid"]).is_none());
}
