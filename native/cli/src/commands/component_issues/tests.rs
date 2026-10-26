use super::{Chalk, issues_json, parse, report};

#[test]
fn parses_component_issues_flags() {
    assert_eq!(parse(&[]), Some(false));
    assert_eq!(parse(&["-j"]), Some(true));
    assert_eq!(parse(&["--json"]), Some(true));
    assert_eq!(parse(&["--help"]), None);
    assert_eq!(parse(&["extra"]), None);
}

#[test]
fn lists_all_25_component_issues_in_order() {
    let json = issues_json();
    let arr = json.as_array().expect("array");
    assert_eq!(arr.len(), 25);
    assert_eq!(arr[0]["name"], "MissingPackagesDependenciesOnFs");
    assert_eq!(arr[23]["name"], "LoadFailures");
    assert_eq!(arr[24]["name"], "PinnedDependencies");
    assert_eq!(arr[24]["isTagBlocker"], false);
    let text = report(Chalk::new(false));
    assert!(text.contains("MissingPackagesDependenciesOnFs"));
    assert!(text.contains("LoadFailures"));
    assert!(text.contains("IGNORING ISSUES (Emergency Use Only)"));
    assert!(text.contains(r#""teambit.component/issues""#));
}
