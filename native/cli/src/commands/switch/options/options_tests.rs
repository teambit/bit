use super::parse;

#[test]
fn accepts_complete_switches_without_dependency_installation() {
    assert_eq!(parse(&["s/dev", "--skip-fetch", "-x"]).unwrap().lane, "s/dev");
    assert_eq!(parse(&["--skip-fetch", "main", "-x"]).unwrap().lane, "main");
    assert!(!parse(&["s/dev", "-x"]).unwrap().skip_fetch);
    assert!(parse(&["s/dev", "--skip-fetch", "-x"]).unwrap().skip_fetch);
    assert!(parse(&["main", "-x", "--force-theirs"]).unwrap().force_theirs);
    assert!(!parse(&["s/dev", "--skip-fetch"]).unwrap().skip_install);
    assert!(parse(&["s/dev", "--skip-fetch", "-x"]).unwrap().skip_install);
    assert_eq!(parse(&["main"]).unwrap().request()["skipDependencyInstallation"], true);
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--branch"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--pattern", "foo"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "-x"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--force-ours"]).unwrap().force_ours);
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--force-theirs"]).unwrap().force_theirs);
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--force-ours", "--force-theirs"]).is_none());
}
