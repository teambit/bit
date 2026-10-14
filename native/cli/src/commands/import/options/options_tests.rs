use super::parse;

#[test]
fn imports_without_installing_and_fetches() {
    let import = parse(&["import", "s/a", "-x"]).unwrap();
    assert!(!import.objects_only && import.skip_dependency_installation);
    assert!(parse(&["import"]).unwrap().objects_only);
    assert!(parse(&["import", "s/a", "-o"]).unwrap().objects_only);
    let fetch = parse(&["fetch", "-c", "s/a"]).unwrap();
    assert_eq!(fetch.request()["components"], true);
}

#[test]
fn installing_imports_and_other_flags_are_left_to_node() {
    for args in [
        &["import", "s/a"][..],
        &["import", "s/a", "--merge", "-x"],
        &["import", "s/a", "-x", "--skip-dependency-installation"],
        &["fetch", "s/a"],
        &["fetch", "--lanes"],
        &["export"],
    ] {
        assert!(parse(args).is_none(), "{args:?}");
    }
}
