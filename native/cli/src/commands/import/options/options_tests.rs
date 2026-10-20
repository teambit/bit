use super::parse;

#[test]
fn imports_without_installing_and_fetches() {
    let import = parse(&["import", "s/a", "-x"]).unwrap();
    assert!(!import.objects_only && import.write.skip_dependency_installation);
    assert!(parse(&["import"]).unwrap().objects_only);
    assert!(parse(&["import", "s/a", "-o"]).unwrap().objects_only);
    let fetch = parse(&["fetch", "-c", "s/a"]).unwrap();
    assert_eq!(fetch.request()["components"], true);
    let original = parse(&["fetch", "-c", "s/a", "--from-original-scopes"]).unwrap();
    assert_eq!(original.request()["fromOriginalScope"], false);
    let lane_original =
        parse(&["fetch", "s/feature", "--lanes", "--from-original-scopes"]).unwrap();
    assert_eq!(lane_original.request()["fromOriginalScope"], false);
    let lanes = parse(&["fetch", "s/feature", "--lanes"]).unwrap();
    assert_eq!(lanes.request()["lanes"], true);
    assert_eq!(parse(&["fetch", "s/feature", "s/other", "--lanes"]).unwrap().ids.len(), 2);
}

#[test]
fn imports_that_install_and_wildcard_patterns() {
    let import = parse(&["import", "s/a"]).unwrap();
    assert!(import.installs());
    let patterns =
        parse(&["import", "s.org/**", "--include-deprecated", "--skip-write-config-files"])
            .unwrap();
    assert_eq!(patterns.wildcards(), ["s.org/**"]);
    assert!(patterns.selection.include_deprecated && patterns.write.skip_write_config_files);
    assert!(!parse(&["import", "s/a", "-x"]).unwrap().installs());
}

#[test]
fn override_requires_a_component_write() {
    let options = parse(&["import", "s/a", "--override", "-x"]).unwrap();
    assert!(options.write.override_existing);
    assert_eq!(options.request()["overrideExisting"], true);
    for args in [&["import", "--override"][..], &["import", "s/a", "--override", "-o"]] {
        assert!(parse(args).is_none(), "{args:?}");
    }
    assert!(parse(&["import", "s/**", "--override", "-x"]).is_some());
}

#[test]
fn path_requires_one_explicit_component_write() {
    let options = parse(&["import", "s/a", "-p", "my-custom-location", "-x"]).unwrap();
    assert_eq!(options.write.path.as_deref(), Some("my-custom-location"));
    assert_eq!(options.request()["path"], "my-custom-location");
    assert_eq!(
        parse(&["import", "--path", "my-location", "s/a"]).unwrap().write.path.as_deref(),
        Some("my-location"),
    );
    for args in [
        &["import", "-p", "location"][..],
        &["import", "s/a", "s/b", "-p", "location"],
        &["import", "s/*", "-p", "location"],
        &["import", "s/a", "-p"],
        &["import", "s/a", "-p", "location", "--path", "other"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}

#[test]
fn merge_requires_one_component_write() {
    for strategy in ["manual", "ours", "theirs"] {
        let flag = format!("--merge={strategy}");
        let options = parse(&["import", "s/a", &flag, "-x"]).unwrap();
        assert_eq!(options.request()["mergeStrategy"], strategy);
    }
    for args in [
        &["import", "--merge=manual"][..],
        &["import", "s/a", "--merge=manual", "-o"],
        &["import", "s/a", "s/b", "--merge=manual"],
        &["import", "s/a", "--merge=manual", "--override"],
        &["import", "s/a", "--merge=invalid"],
        &["import", "s/a", "--merge=manual", "--merge=ours"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
    assert!(parse(&["import", "s/*", "--merge=manual", "-x"]).is_some());
}

#[test]
fn installing_imports_and_other_flags_are_left_to_node() {
    for args in [
        &["import", "**"][..],
        &["import", "*/button"],
        &["import", "@s/*"],
        &["import", "s/a", "--merge", "-x"],
        &["import", "s/a", "-x", "--skip-dependency-installation"],
        &["fetch", "s/a"],
        &["export"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}

#[test]
fn implicit_and_main_lane_fetches_are_native_inputs() {
    for args in [
        &["fetch", "--lanes"][..],
        &["fetch", "main", "--lanes"],
        &["fetch", "main", "scope/dev", "--lanes"],
    ] {
        assert!(parse(args).is_some(), "{args:?}");
    }
}

#[test]
fn adoption_flags_preserve_fetch_and_write_choices() {
    let options =
        parse(&["import", "scope/comp", "--track-only", "--write-deps", "package.json", "-x"])
            .unwrap();
    assert!(options.write.adoption.track_only);
    assert!(!options.installs());
    assert_eq!(options.request()["adoption"]["writeDeps"], "package.json");
    assert!(parse(&["import", "scope/comp", "--write-to-empty-dir"]).unwrap().installs());
    assert!(parse(&["fetch", "-c", "scope/comp", "--track-only"]).is_none());
}

#[test]
fn dependent_paths_require_noninteractive_selection_without_losing_raw_ids() {
    let options = parse(&[
        "import",
        "scope/comp",
        "--dependents-via",
        "scope/middle, scope/other",
        "--silent",
        "-x",
    ])
    .unwrap();
    assert_eq!(
        options.request()["dependents"]["via"],
        serde_json::json!(["scope/middle", "scope/other"]),
    );
    assert_eq!(options.request()["dependents"]["enabled"], true);
    assert!(parse(&["import", "scope/comp", "--dependents"]).is_none());
    assert!(parse(&["import", "scope/comp", "--dependents-all", "--silent"]).is_some());
    assert!(parse(&["import", "--silent"]).is_some());
}

#[test]
fn semantic_adoption_errors_parse_for_owned_validation_after_provider_startup() {
    for (args, error) in semantic_errors() {
        let options = parse(args).unwrap();
        assert_eq!(options.validation_error(), Some(error));
        assert!(!options.requires_facts());
        assert!(!options.needs_installer());
    }
    assert!(parse(&["import", "scope/comp", "--write-deps"]).is_none());
    assert_eq!(
        parse(&["import", "--dependents"]).unwrap().validation_error(),
        Some(r#"you have to specify ids to use "--dependents" flag"#),
    );
}

fn semantic_errors() -> Vec<(&'static [&'static str], &'static str)> {
    vec![
        (&["import", "--track-only"], r#"you have to specify ids to use "--track-only" flag"#),
        (
            &["import", "--dependents", "--silent"],
            r#"you have to specify ids to use "--dependents" flag"#,
        ),
        (
            &["import", "--dependents-via", "scope/middle", "--silent"],
            r#"you have to specify ids to use "--dependents-via" flag"#,
        ),
        (
            &["import", "scope/comp", "--write-to-empty-dir", "--override"],
            "--override and --write-to-empty-dir cannot be used together",
        ),
        (
            &["import", "scope/comp", "--write-to-empty-dir", "--path", "target"],
            "--path and --write-to-empty-dir cannot be used together",
        ),
    ]
}
