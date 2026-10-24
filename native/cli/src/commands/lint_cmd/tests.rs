use super::{Options, is_missing_host, parse_options};

#[test]
fn parses_lint_options_and_detects_missing_host() {
    let opts = parse_options(&["ui/*", "-c", "-f", "--fix-type", "problem", "--json"]).unwrap();
    assert_eq!(
        opts,
        Options {
            pattern: Some("ui/*".into()),
            changed: true,
            fix: true,
            fix_type: Some("problem".into()),
            json: true,
        },
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(is_missing_host(temp.path(), &Options::default()));
    assert!(!is_missing_host(temp.path(), &opts));
}
