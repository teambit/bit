//! Unit tests for [`Kind::Tag`] and [`Kind::Snap`] build, skip-tests, skip-tasks, and editor workflow CLI flag parsing ([`parse`]).
//!
//! Verifies `--build`, `--skip-tests`, `--skip-tasks`, and `--editor` workflow parameter extraction across [`parse`].

use super::parse;
use crate::commands::workspace_command::resolve::Kind;
use serde_json::json;

/// Verifies [`parse`] extracts [`Kind::Tag`] workflow tooling flags while preserving selection and release arguments.
///
/// Confirms `--build`, `--skip-tests`, and `--skip-tasks` populate `workflow.parameters(Kind::Tag)`.
#[test]
fn tooling_flags_preserve_selection_and_release_arguments() {
    let (workflow, args) = parse(
        &["scope/*", "--build", "--skip-tests", "--skip-tasks", "Compiler, Test", "--ver", "2.0.0"],
        Kind::Tag,
    )
    .unwrap();
    assert_eq!(args, ["scope/*", "--ver", "2.0.0"]);
    let params = workflow.parameters(Kind::Tag);
    assert_eq!(params["build"], true);
    assert_eq!(params["skipTests"], true);
    assert_eq!(params["skipTasks"], "Compiler, Test");
    assert!(params.get("isSnap").is_none());
}

/// Verifies duplicate flag rejection, default `--editor` (`vim`), and [`Kind`]-specific `--disable-tag-pipeline` handling in [`parse`].
///
/// Ensures `--disable-tag-pipeline` is consumed by [`Kind::Tag`] and left as a remaining argument for [`Kind::Snap`].
#[test]
fn aliases_duplicates_optional_editor_and_command_specific_flags() {
    assert!(parse(&["-b", "--build"], Kind::Snap).is_none());
    assert!(parse(&["--skip-tasks", "--build"], Kind::Snap).is_none());
    let (workflow, args) = parse(&["--editor", "--unmodified"], Kind::Snap).unwrap();
    assert_eq!(workflow.editor.as_deref(), Some("vim"));
    assert_eq!(args, ["--unmodified"]);
    let (workflow, args) = parse(&["--disable-tag-pipeline"], Kind::Snap).unwrap();
    assert_eq!(args, ["--disable-tag-pipeline"]);
    assert_eq!(workflow.parameters(Kind::Snap)["disableTagAndSnapPipelines"], json!(false));
    let (workflow_tag, args_tag) = parse(&["--disable-tag-pipeline"], Kind::Tag).unwrap();
    assert!(args_tag.is_empty());
    assert_eq!(workflow_tag.parameters(Kind::Tag)["disableTagAndSnapPipelines"], json!(true));
}
