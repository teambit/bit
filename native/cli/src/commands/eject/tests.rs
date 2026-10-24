use super::{Options, parse_options, validate_workspace};
use std::fs;

#[test]
fn parses_eject_options() {
    assert_eq!(
        parse_options(&["comp1", "-f", "-x", "--keep-files"]),
        Some(Options {
            pattern: "comp1".into(),
            force: true,
            skip_dependency_installation: true,
            json: false,
            keep_files: true,
        }),
    );
    assert_eq!(parse_options(&[]), None);
}

#[test]
fn rejects_eject_when_workspace_on_lane() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join(".bitmap"),
        r#"{
            "comp1": {
                "scope": "my-scope",
                "version": "00112233445566778899aabbccddeeff00112233",
                "mainFile": "index.js",
                "rootDir": "comp1"
            },
            "_bit_lane": {
                "id": { "name": "dev", "scope": "my-scope" },
                "exported": false
            }
        }"#,
    )
    .unwrap();
    let err = validate_workspace(temp.path(), "comp1").unwrap().unwrap();
    assert!(err.contains("unable to eject when the workspace is on a lane"), "{err}");
}
