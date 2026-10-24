use super::{Options, parse_component_name, parse_options, validate_outside_workspace};
use std::fs;

#[test]
fn parses_clone_options() {
    assert_eq!(
        parse_options(&["my-scope/workspace", "target-dir", "-l", "my-scope/dev", "-x"]),
        Some(Options {
            id: "my-scope/workspace".into(),
            dir: Some("target-dir".into()),
            lane: Some("my-scope/dev".into()),
            remote: None,
            skip_dependency_installation: true,
        }),
    );
    assert_eq!(parse_options(&[]), None);
    assert_eq!(parse_options(&["a", "b", "c"]), None);
}

#[test]
fn parses_component_name_from_scoped_id() {
    assert_eq!(parse_component_name("my-scope/workspace"), Some("workspace".into()));
    assert_eq!(parse_component_name("my-scope/ns/workspace@0.0.1"), Some("workspace".into()));
    assert_eq!(parse_component_name("unscoped"), None);
}

#[test]
fn validates_non_empty_dir_and_unscoped_lane() {
    let temp = tempfile::tempdir().unwrap();
    let non_empty = temp.path().join("non-empty");
    fs::create_dir_all(&non_empty).unwrap();
    fs::write(non_empty.join("file.txt"), "hello").unwrap();

    let err = validate_outside_workspace(
        temp.path(),
        &Options {
            id: "my-scope/ws".into(),
            dir: Some("non-empty".into()),
            lane: None,
            remote: None,
            skip_dependency_installation: false,
        },
    )
    .unwrap()
    .unwrap();
    assert!(err.contains("the directory is not empty"), "{err}");

    let lane_err = validate_outside_workspace(
        temp.path(),
        &Options {
            id: "my-scope/ws".into(),
            dir: Some("empty-target".into()),
            lane: Some("dev".into()),
            remote: None,
            skip_dependency_installation: false,
        },
    )
    .unwrap()
    .unwrap();
    assert!(lane_err.contains("the lane must be given with its scope"), "{lane_err}");
}
