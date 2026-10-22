use super::{Options, is_missing_scope, parse_options};

#[test]
fn parses_pack_options_and_detects_missing_scope() {
    assert_eq!(parse_options(&[]), None);
    let opts = parse_options(&["comp1", "-d", "out", "-o", "-k", "-p", "-j"]).unwrap();
    assert_eq!(
        opts,
        Options {
            comp_id: "comp1".into(),
            scope_path: None,
            out_dir: Some("out".into()),
            override_existing: true,
            keep: true,
            prefix: true,
            json: true,
        },
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(is_missing_scope(temp.path(), &opts));
}
