use super::parse;

#[test]
fn accepts_the_native_subset() {
    let options = parse(&["0.0.1", "one", "-x"]).unwrap();
    assert_eq!((options.to.as_str(), options.pattern.as_deref()), ("0.0.1", Some("one")));
    assert!(parse(&["head", "--skip-dependency-installation", "--all"]).unwrap().all);
    assert!(parse(&["latest", "--all"]).unwrap().all);
    assert!(parse(&["head", "one", "--all"]).is_none());
    assert!(parse(&["reset", "-x", "-a"]).unwrap().all);
    assert_eq!(parse(&["head", "-x", "-r", "theirs"]).unwrap().strategy.as_deref(), Some("theirs"));
    assert_eq!(parse(&["head", "-x", "--manual"]).unwrap().strategy.as_deref(), Some("manual"));
    assert!(parse(&["head~2", "-x"]).is_some());
    assert!(parse(&["1.0.0-rc.1+build", "-x"]).is_some());
    assert!(parse(&[&"a".repeat(40), "-x"]).is_some());
}

#[test]
fn rejects_everything_else() {
    assert!(!parse(&["head"]).unwrap().skip_install);
    assert!(parse(&["head", "-x"]).unwrap().skip_install);
    assert!(parse(&["head", "-x", "-x"]).is_none());
    assert!(parse(&["head", "-x", "--manual", "-r", "ours"]).is_none());
    assert!(parse(&["head", "-x", "-r", "mine"]).is_none());
    assert!(parse(&["head", "-x", "-r"]).is_none());
    assert!(parse(&["head", "-x", "--force-ours", "--force-theirs"]).is_none());
    assert!(parse(&["1.0", "-x"]).is_none());
    assert!(parse(&["head", "One", "-x"]).is_none());
    assert!(parse(&["head", "a", "b", "-x"]).is_none());
    assert!(parse(&["head", "-x", "--json"]).is_none());
}

#[test]
fn head_and_latest_without_a_pattern_report_as_all() {
    assert!(parse(&["head", "-x"]).unwrap().report_all());
    assert!(parse(&["latest", "-x"]).unwrap().report_all());
    assert!(!parse(&["head", "one", "-x"]).unwrap().report_all());
    assert!(!parse(&["0.0.1", "one", "-x"]).unwrap().report_all());
    assert!(parse(&["0.0.1", "-x", "--all"]).unwrap().report_all());
}
