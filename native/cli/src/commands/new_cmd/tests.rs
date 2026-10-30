use super::{Options, parse_options, validate_options};
use std::fs;
use tempfile::tempdir;

#[test]
fn parses_new_arguments_and_options() {
    assert_eq!(
        parse_options(&[
            "react",
            "my-workspace",
            "--aspect",
            "teambit.react/react-env",
            "--default-scope",
            "my-org.my-scope",
            "--standalone",
            "--skip-git",
            "--empty",
        ]),
        Some(Options {
            template_name: "react".to_owned(),
            workspace_name: "my-workspace".to_owned(),
            aspect: Some("teambit.react/react-env".to_owned()),
            load_from: None,
            current_dir: false,
        }),
    );
    assert_eq!(parse_options(&["react"]), None);
    assert_eq!(parse_options(&["react", "my-workspace", "--no-standalone"]), None);
    assert_eq!(parse_options(&["react", "my-workspace", "--no-skip-git"]), None);
    assert_eq!(parse_options(&["react", "my-workspace", "--no-empty"]), None);
    assert_eq!(parse_options(&["react", "my-workspace", "--no-current-dir"]), None);
}

#[test]
fn validates_existing_workspace_existing_path_and_load_from() {
    let dir = tempdir().expect("tempdir");
    let base_options = Options {
        template_name: "react".to_owned(),
        workspace_name: "my-ws".to_owned(),
        aspect: None,
        load_from: None,
        current_dir: false,
    };

    assert_eq!(validate_options(dir.path(), &base_options), Ok(()));

    fs::create_dir_all(dir.path().join("my-ws")).expect("mkdir my-ws");
    let err = validate_options(dir.path(), &base_options).expect_err("expected existing path");
    assert!(err.contains(r#"unable to create a workspace at "my-ws", this path already exists"#));

    let load_missing_aspect = Options {
        workspace_name: "new-ws".to_owned(),
        load_from: Some("other-ws".to_owned()),
        ..base_options.clone()
    };
    let err =
        validate_options(dir.path(), &load_missing_aspect).expect_err("expected missing --aspect");
    assert!(err.contains("please provide the aspect-id using --aspect flag"));

    let load_invalid_ws = Options { aspect: Some("my-aspect".to_owned()), ..load_missing_aspect };
    let err =
        validate_options(dir.path(), &load_invalid_ws).expect_err("expected invalid workspace");
    assert!(err.contains(r#"fatal: "other-ws" is not a valid Bit workspace"#));

    fs::write(dir.path().join("workspace.jsonc"), "{}\n").expect("write workspace.jsonc");
    fs::write(dir.path().join(".bitmap"), "{}\n").expect("write .bitmap");
    let err = validate_options(dir.path(), &base_options).expect_err("expected inside existing ws");
    assert!(err.contains(
        "Error: unable to generate a new workspace inside of an existing workspace"
    ),);
}
