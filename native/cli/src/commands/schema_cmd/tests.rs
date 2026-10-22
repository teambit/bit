use super::{Options, is_missing_host, parse_options};

#[test]
fn parses_schema_options_and_detects_missing_host() {
    assert_eq!(parse_options(&[]), None);
    let opts = parse_options(&["comp1", "-j"]).unwrap();
    assert_eq!(opts, Options { pattern: "comp1".into(), remote: false, json: true });

    let temp = tempfile::tempdir().unwrap();
    assert!(is_missing_host(temp.path(), &opts));
    let remote_opts = parse_options(&["scope/comp1", "--remote"]).unwrap();
    assert!(!is_missing_host(temp.path(), &remote_opts));
}
