use super::{Chalk, render_details, valid_args};
use std::{ffi::OsString, fs};

#[test]
fn validates_empty_details_arguments() {
    assert!(valid_args(&[OsString::from("details")]));
    assert!(!valid_args(&[OsString::from("details"), OsString::from("--help")]));
    assert!(!valid_args(&[OsString::from("details"), OsString::from("extra")]));
}

#[test]
fn renders_missing_and_persisted_command_details() {
    let temp = tempfile::tempdir().unwrap();
    let chalk = Chalk::new(false);
    let missing = render_details(temp.path(), chalk).unwrap();
    assert_eq!(
        missing,
        r#"no details available. run a command like "bit tag" or "bit snap" first."#,
    );

    fs::write(temp.path().join("content"), "comp1@0.0.1\ncomp2@0.0.1").unwrap();
    fs::write(
        temp.path().join("meta.json"),
        r#"{"command":"tag","timestamp":"2026-10-20T12:00:00.000Z"}"#,
    )
    .unwrap();
    let rendered = render_details(temp.path(), chalk).unwrap();
    assert_eq!(
        rendered,
        "details from \"bit tag\"  2026-10-20T12:00:00.000Z\n\ncomp1@0.0.1\ncomp2@0.0.1\n\n(these are details from the last command that provided them)",
    );
}
