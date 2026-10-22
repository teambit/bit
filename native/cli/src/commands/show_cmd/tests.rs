use super::{Options, missing_host_error, parse_options};

#[test]
fn parses_show_options_and_detects_missing_host_errors() {
    assert_eq!(parse_options(&[]), None);
    let opts = parse_options(&["comp1", "-j", "-r", "-c"]).unwrap();
    assert_eq!(
        opts,
        Options {
            id: "comp1".into(),
            json: true,
            legacy: false,
            remote: true,
            browser: false,
            compare: true,
        },
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(missing_host_error(temp.path(), &opts).unwrap().contains("--legacy"));
    let local_opts = parse_options(&["comp1"]).unwrap();
    assert!(
        missing_host_error(temp.path(), &local_opts).unwrap().contains("Consider using --remote"),
    );
}
