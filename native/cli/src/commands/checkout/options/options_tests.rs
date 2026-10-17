use super::{parse, parse_revert};

#[test]
fn revert_accepts_only_its_positional_order_and_options() {
    let options = parse_revert(&["scope/one", "0.0.1", "-x"]).unwrap();
    assert!(options.revert);
    assert_eq!(options.pattern.as_deref(), Some("scope/one"));
    assert_eq!(options.to, "0.0.1");
    assert_eq!(options.request()["revert"], true);
    assert!(parse_revert(&["scope/one", "main", "--verbose"]).is_some());
    assert!(parse_revert(&["**", "main"]).is_some());
    for args in [
        vec!["scope/one", "head"],
        vec!["scope/one", "reset"],
        vec!["scope/one", "head~1"],
        vec!["scope/one", "0.0.1", "--all"],
        vec!["0.0.1", "scope/one"],
    ] {
        assert!(parse_revert(&args).is_none(), "{args:?}");
    }
}

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
    assert!(parse(&["head", "-e", "-x"]).unwrap().workspace_only);
    assert_eq!(
        parse(&["head", "--workspace-only", "-x"]).unwrap().request()["workspaceOnly"],
        true,
    );
    assert!(parse(&["1.0.0-rc.1+build", "-x"]).is_some());
    assert!(parse(&[&"a".repeat(40), "-x"]).is_some());
}

#[test]
fn rejects_everything_else() {
    assert!(!parse(&["head"]).unwrap().execution.skip_install);
    assert!(parse(&["head", "-x"]).unwrap().execution.skip_install);
    assert!(parse(&["head", "-x", "-x"]).is_none());
    assert_eq!(
        parse(&["head", "-x", "--manual", "-r", "ours"]).unwrap().strategy.as_deref(),
        Some("manual"),
    );
    assert!(parse(&["head", "-x", "-r", "mine"]).is_none());
    assert!(parse(&["head", "-x", "-r"]).is_none());
    assert!(parse(&["head", "-x", "--force-ours", "--force-theirs"]).is_none());
    assert!(parse(&["1.0", "-x"]).is_none());
    assert!(parse(&["head", "One", "-x"]).is_some());
    assert!(parse(&["head", "a", "b", "-x"]).is_none());
    assert!(parse(&["head", "-x", "--json"]).is_none());
    assert!(parse(&["reset", "-x", "-e"]).is_none());
    assert!(parse(&["latest", "-x", "--workspace-only"]).is_none());
    assert!(parse(&["head", "-e", "--workspace-only"]).is_none());
}

#[test]
fn head_and_latest_without_a_pattern_report_as_all() {
    assert!(parse(&["head", "-x"]).unwrap().report_all());
    assert!(parse(&["latest", "-x"]).unwrap().report_all());
    assert!(!parse(&["head", "one", "-x"]).unwrap().report_all());
    assert!(!parse(&["0.0.1", "one", "-x"]).unwrap().report_all());
    assert!(parse(&["0.0.1", "-x", "--all"]).unwrap().report_all());
}

#[test]
fn checkout_and_revert_preserve_component_predicates() {
    for pattern in ["comp*", "**/comp[13]*", "$modified", "comp* AND $modified", "comp*,!**/comp2"]
    {
        assert_eq!(parse(&["0.0.1", pattern, "-x"]).unwrap().pattern.as_deref(), Some(pattern));
        assert_eq!(
            parse_revert(&[pattern, "0.0.1", "-x"]).unwrap().pattern.as_deref(),
            Some(pattern),
        );
    }
}
