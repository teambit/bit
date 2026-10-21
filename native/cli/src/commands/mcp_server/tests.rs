use super::{
    SetupOptions, Subcommand, execute_setup, parse_subcommand,
    rules::{RulesOptions, execute_rules},
};
use crate::commands::color::Chalk;
use std::fs;
use tempfile::tempdir;

#[test]
fn parses_setup_and_rules_subcommands() {
    assert_eq!(
        parse_subcommand(&["setup"]),
        Some(Subcommand::Setup(SetupOptions {
            editor: "vscode".into(),
            consumer_project: false,
            include_additional: None,
            is_global: false,
        })),
    );
    assert_eq!(
        parse_subcommand(&[
            "setup",
            "cursor",
            "-g",
            "--consumer-project",
            "--include-additional",
            "tag,snap"
        ]),
        Some(Subcommand::Setup(SetupOptions {
            editor: "cursor".into(),
            consumer_project: true,
            include_additional: Some("tag,snap".into()),
            is_global: true,
        })),
    );
    assert_eq!(
        parse_subcommand(&["rules", "claude-code", "-p", "--force-standard"]),
        Some(Subcommand::Rules(RulesOptions {
            editor: "claude-code".into(),
            is_global: false,
            should_print: true,
            consumer_project: false,
            force_standard: true,
        })),
    );
    assert_eq!(parse_subcommand(&["start"]), None);
    assert_eq!(parse_subcommand(&[]), None);
}

#[test]
fn writes_workspace_setup_and_rules_files() {
    let dir = tempdir().expect("tempdir");
    let setup_out = execute_setup(
        dir.path(),
        &SetupOptions {
            editor: "cursor".into(),
            consumer_project: true,
            include_additional: None,
            is_global: false,
        },
        Chalk::new(false),
    );
    assert!(setup_out.contains("configured Cursor MCP integration (workspace)"));
    let mcp_json = fs::read_to_string(
        dir.path()
            .join(".cursor")
            .join("mcp.json"),
    )
    .expect("read mcp.json");
    assert!(mcp_json.contains("--consumer-project"));

    let rules_out = execute_rules(
        dir.path(),
        &RulesOptions {
            editor: "cursor".into(),
            is_global: false,
            should_print: false,
            consumer_project: true,
            force_standard: false,
        },
        Chalk::new(false),
    );
    assert!(rules_out.contains("Successfully wrote Cursor Bit MCP rules file (workspace)"));
    let rules_mdc = fs::read_to_string(
        dir.path()
            .join(".cursor")
            .join("rules")
            .join("bit.rules.mdc"),
    )
    .expect("read bit.rules.mdc");
    assert!(rules_mdc.starts_with(
        "---\ndescription: Bit MCP Agent Instructions\nalwaysApply: true\n---"
    ));
}
