use super::parse;

#[test]
fn imports_without_installing_and_fetches() {
    let import = parse(&["import", "s/a", "-x"]).unwrap();
    assert!(!import.objects_only && import.skip_dependency_installation);
    assert!(parse(&["import"]).unwrap().objects_only);
    assert!(parse(&["import", "s/a", "-o"]).unwrap().objects_only);
    let fetch = parse(&["fetch", "-c", "s/a"]).unwrap();
    assert_eq!(fetch.request()["components"], true);
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
    assert!(patterns.include_deprecated && patterns.skip_write_config_files);
    assert!(!parse(&["import", "s/a", "-x"]).unwrap().installs());
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
        &["fetch", "--lanes"],
        &["export"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}
