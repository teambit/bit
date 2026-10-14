use super::parse;

#[test]
fn accepts_only_local_full_switches() {
    assert_eq!(parse(&["s/dev", "--skip-fetch", "-x"]).unwrap().lane, "s/dev");
    assert_eq!(parse(&["--skip-fetch", "main", "-x"]).unwrap().lane, "main");
    assert!(parse(&["s/dev", "-x"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--branch"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--pattern", "foo"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "-x"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--force-ours"]).unwrap().force_ours);
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--force-theirs"]).unwrap().force_theirs);
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--force-ours", "--force-theirs"]).is_none());
}
