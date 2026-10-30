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
    assert_eq!(
        parse(&["s/dev", "--skip-fetch", "-x", "--pattern", "foo"]).unwrap().request()["lane"]["pattern"],
        "foo",
    );
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "-x"]).is_none());
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--force-ours"]).unwrap().force_ours);
    assert!(parse(&["s/dev", "--skip-fetch", "-x", "--force-theirs"]).unwrap().force_theirs);
    let conflicting =
        parse(&["s/dev", "--skip-fetch", "-x", "--force-ours", "--force-theirs"]).unwrap();
    assert!(conflicting.force_ours && conflicting.force_theirs);
    let inline =
        parse(&["s/dev", "--skip-fetch=true", "--pattern=foo", "--alias=my-alias", "--no-color"])
            .unwrap();
    assert!(inline.skip_fetch);
    assert_eq!(inline.adoption.pattern.as_deref(), Some("foo"));
    assert_eq!(inline.adoption.alias.as_deref(), Some("my-alias"));
}

#[test]
fn switch_adoption_values_are_lane_scoped_and_strategy_is_checkout_scoped() {
    let options = parse(&[
        "remote/dev",
        "-n",
        "local-dev",
        "-p",
        "**/one,!**/two",
        "--workspace-only",
        "-r",
        "manual",
    ])
    .unwrap();
    let request = options.request();
    assert_eq!(request["lane"]["alias"], "local-dev");
    assert_eq!(request["lane"]["pattern"], "**/one,!**/two");
    assert_eq!(request["lane"]["workspaceOnly"], true);
    assert_eq!(request["strategy"], "manual");
    assert!(request.get("pattern").is_none());
    assert!(options.supported_pattern());
    assert!(!parse(&["remote/dev", "-p", "$modified"]).unwrap().supported_pattern());
    assert!(!parse(&["remote/dev", "-p", "foo AND bar"]).unwrap().supported_pattern());
}

#[test]
fn lane_import_has_its_own_flag_set_but_retains_semantic_errors() {
    let options = super::parse_import(&[
        "remote/dev",
        "-p",
        "$modified",
        "-r",
        "invalid",
        "--force-ours",
        "--force-theirs",
    ])
    .unwrap();
    assert_eq!(options.adoption.strategy.as_deref(), Some("invalid"));
    assert!(options.force_ours && options.force_theirs);
    for flag in ["--json", "--alias", "--workspace-only", "--verbose", "--skip-fetch", "--branch"] {
        assert!(super::parse_import(&["remote/dev", flag]).is_none());
    }
    assert!(parse(&["remote/dev", "--alias"]).is_none());
    assert!(parse(&["remote/dev", "-p", "--force-ours"]).is_none());
    assert!(parse(&["remote/dev", "-n", "one", "--alias", "two"]).is_none());
}

#[test]
fn static_bracket_patterns_remain_native_without_enabling_state_expressions() {
    let options = parse(&["remote/dev", "--pattern", "remote/comp0[024]", "-x"]).unwrap();
    assert!(options.supported_pattern());
    assert!(parse(&["remote/dev", "-p", "remote/comp[1-3]"]).unwrap().supported_pattern());
    assert_eq!(options.request()["lane"]["pattern"], "remote/comp0[024]");
    assert!(
        options
            .request()
            .get("pattern")
            .is_none(),
    );
    for pattern in [
        "$modified",
        "remote/* AND $modified",
        "remote/*&other/*",
        "remote/comp{1..3}",
        "remote/comp{a..c}",
        "remote/comp!1",
        "#comment",
        ",",
        "remote/comp{1,3}",
        "remote/comp+(1|3)",
    ] {
        assert!(!parse(&["remote/dev", "-p", pattern]).unwrap().supported_pattern());
    }
}
