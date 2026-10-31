use super::{Options, check_types_error, parse_options};

#[test]
fn parses_watch_options_and_validates_check_types() {
    let opts = parse_options(&[
        "-v",
        "--skip-pre-compilation",
        "-t",
        "project",
        "--import",
        "--generate-types",
        "--trigger",
        "comp1",
    ])
    .unwrap();
    assert_eq!(
        opts,
        Options {
            verbose: true,
            skip_pre_compilation: true,
            check_types: Some("project".into()),
            import: true,
            skip_import: false,
            generate_types: true,
            trigger: Some("comp1".into()),
        },
    );
    assert_eq!(check_types_error(&opts), None);

    let invalid = parse_options(&["--check-types", "invalid"]).unwrap();
    assert_eq!(
        check_types_error(&invalid),
        Some(r#"check-types can be either "file" or "project". got "invalid""#.into()),
    );
    assert_eq!(parse_options(&["--trigger=-bad"]), None);
    assert!(parse_options(&["--verbose=true", "--import=false"]).unwrap().verbose);
}
