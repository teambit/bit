use super::{Options, parse_options, validate_options};
use std::fs;
use tempfile::tempdir;

#[test]
fn parses_create_arguments_and_options() {
    assert_eq!(
        parse_options(&[
            "react",
            "comp1",
            "comp2",
            "--namespace",
            "ui",
            "--scope",
            "my-scope",
            "--aspect",
            "my-aspect",
            "--template",
            "my-template",
            "--path",
            "src",
            "--env",
            "my-env",
            "--force",
        ]),
        Some(Options {
            template_name: "react".to_owned(),
            component_names: vec!["comp1".to_owned(), "comp2".to_owned()],
            scope: Some("my-scope".to_owned()),
        }),
    );
    assert_eq!(parse_options(&["react"]), None);
    assert_eq!(parse_options(&["react", "comp1", "--no-force"]), None);
}

#[test]
fn rejects_invalid_scope_and_same_name_as_template() {
    let dir = tempdir().expect("tempdir");
    fs::write(
        dir.path().join("workspace.jsonc"),
        r#"{"teambit.workspace/workspace": {"defaultScope": "my-scope"}}"#,
    )
    .expect("write workspace.jsonc");
    fs::write(dir.path().join(".bitmap"), "{}\n").expect("write .bitmap");

    let options = Options {
        template_name: "react-env".to_owned(),
        component_names: vec!["comp1".to_owned()],
        scope: None,
    };

    let invalid_scope = Options { scope: Some("Invalid Scope!".to_owned()), ..options.clone() };
    let err = validate_options(dir.path(), &invalid_scope).expect_err("expected invalid scope");
    assert!(err.contains("is invalid, component scope names can only contain"));

    let same_name = Options { component_names: vec!["react-env".to_owned()], ..options.clone() };
    let err = validate_options(dir.path(), &same_name).expect_err("expected same name error");
    assert!(err.contains(
        r#"unable to create a component with the same name as the template "react-env""#
    ));
    assert!(err.contains("class ReactEnv extends ReactEnv {}"));

    assert_eq!(validate_options(dir.path(), &options), Ok(()));
}
