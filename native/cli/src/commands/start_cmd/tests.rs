use super::{is_outside_workspace_and_scope, parse_options};

#[test]
fn parses_start_options_and_detects_missing_workspace_or_scope() {
    let opts = parse_options(&[
        "ui/*",
        "-d",
        "-p",
        "3000",
        "--rebuild",
        "--skip-ui-build",
        "-n",
        "--skip-compilation",
    ])
    .unwrap();
    assert_eq!(opts.pattern.as_deref(), Some("ui/*"));
    assert!(opts.dev);
    assert_eq!(opts.port.as_deref(), Some("3000"));
    assert!(opts.rebuild);
    assert!(opts.skip_ui_build);
    assert!(opts.no_browser);
    assert!(opts.skip_compilation);

    let combined = parse_options(&["-drsnv"]).unwrap();
    assert!(combined.dev && combined.rebuild && combined.skip_ui_build && combined.no_browser);

    let temp = tempfile::tempdir().unwrap();
    assert!(is_outside_workspace_and_scope(temp.path()));
}
