use super::{
    Options, can_use_builtin_workspace_templates,
    catalog::{format_templates_report, friendly_aspect_name, select_templates},
    parse_options,
};
use crate::commands::color::Chalk;
use std::fs;

#[test]
fn parses_templates_options() {
    assert_eq!(
        parse_options(&["--show-all", "--aspect", "my-aspect", "--json"]),
        Some(Options { show_all: true, aspect: Some("my-aspect".to_owned()), json: true }),
    );
    assert_eq!(parse_options(&["unexpected"]), None);
}

#[test]
fn selects_and_formats_workspace_and_component_templates() {
    let ws_tpls = select_templates(false, false, None);
    assert_eq!(ws_tpls.len(), 4);
    assert_eq!(ws_tpls[0].name, "basic");
    let ws_report = format_templates_report(&ws_tpls, false, Chalk::new(false));
    assert!(ws_report.contains(
        "The following template(s) are available with the command bit new:"
    ));
    assert!(ws_report.contains("React (env: bitdev.react/react-env)"));

    let comp_default = select_templates(true, false, None);
    assert!(!comp_default.iter().any(|tpl| tpl.hidden));
    let comp_all = select_templates(true, true, None);
    assert!(comp_all.len() > comp_default.len());
    let react_only = select_templates(true, false, Some("teambit.react/react"));
    assert!(
        react_only
            .iter()
            .all(|tpl| tpl.aspect_id == "teambit.react/react"),
    );

    let comp_report = format_templates_report(&comp_default, true, Chalk::new(false));
    assert!(comp_report.contains(
        "The following template(s) are available with the command bit create:"
    ));
    assert_eq!(friendly_aspect_name("teambit.mdx/mdx"), "MDX");
    assert_eq!(friendly_aspect_name("teambit.react/react"), "React");
}

#[test]
fn detects_custom_generator_config_in_workspace() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(
        root.join("workspace.jsonc"),
        r#"{"teambit.workspace/workspace": {"defaultScope": "my-scope"}, "teambit.generator/generator": {"envs": []}}"#,
    )
    .unwrap();
    fs::write(root.join(".bitmap"), "{}\n").unwrap();
    assert!(can_use_builtin_workspace_templates(root, None));
    assert!(!can_use_builtin_workspace_templates(root, Some("my-org.scope/custom-env")));

    fs::write(
        root.join("workspace.jsonc"),
        r#"{"teambit.workspace/workspace": {"defaultScope": "my-scope"}, "teambit.generator/generator": {"envs": ["bitdev.react/react-env"]}}"#,
    )
    .unwrap();
    assert!(!can_use_builtin_workspace_templates(root, None));
}
