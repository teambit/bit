use super::{Options, is_outside_workspace_and_scope, parse_options};

#[test]
fn parses_ui_build_options_and_detects_missing_host() {
    assert_eq!(parse_options(&[]), Some(Options { ui_root_name: None }));
    assert_eq!(
        parse_options(&["teambit.workspace/workspace"]),
        Some(Options { ui_root_name: Some("teambit.workspace/workspace".into()) }),
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(is_outside_workspace_and_scope(temp.path()));
}
