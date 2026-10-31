use super::{Action, Chalk, WorkspaceTrust, is_valid_pattern, parse_action, parse_tokens};
use crate::commands::workspace_command::format::Formatter;
use std::{ffi::OsString, fs, path::Path};

fn os_args(items: &[&str]) -> Vec<OsString> {
    items
        .iter()
        .map(OsString::from)
        .collect()
}

fn write_workspace(root: &Path, default_scope: &str) {
    fs::create_dir_all(root.join(".bit")).unwrap();
    fs::write(
        root.join("workspace.jsonc"),
        format!(
            "{{\n  \"teambit.workspace/workspace\": {{\n    \"defaultScope\": \"{default_scope}\"\n  }}\n}}\n",
        ),
    )
    .unwrap();
}

#[test]
fn parses_tokens_and_actions() {
    assert_eq!(parse_tokens(&os_args(&["scope", "trust"])), Some(Vec::new()));
    assert_eq!(
        parse_tokens(&os_args(&[
            "scope",
            "trust",
            "add",
            "acme.*",
            "--no-color",
            "--no-color=false",
        ])),
        Some(vec!["add".to_owned(), "acme.*".to_owned()]),
    );
    assert_eq!(parse_tokens(&os_args(&["scope", "trust", "--help"])), None);
    assert_eq!(parse_tokens(&os_args(&["scope", "trust", "a", "b", "c"])), None);

    assert_eq!(parse_action(&[]).ok(), Some(Action::List));
    assert_eq!(parse_action(&["enable".to_owned()]).ok(), Some(Action::Enable));
    assert_eq!(parse_action(&["disable".to_owned()]).ok(), Some(Action::Disable));
    assert_eq!(
        parse_action(&["add".to_owned(), "acme.*".to_owned()]).ok(),
        Some(Action::Add("acme.*".to_owned())),
    );
    assert!(parse_action(&["add".to_owned()]).is_err());
    assert!(parse_action(&["bogus".to_owned()]).is_err());
}

#[test]
fn validates_scope_trust_patterns() {
    assert!(is_valid_pattern("acme.frontend"));
    assert!(is_valid_pattern("my-scope"));
    assert!(is_valid_pattern("acme.*"));
    assert!(!is_valid_pattern("acme.frontend.*"));
    assert!(!is_valid_pattern("Acme.*"));
    assert!(!is_valid_pattern("a"));
    assert!(!is_valid_pattern(".*"));
}

#[test]
fn manages_trusted_scopes_lifecycle_in_workspace_jsonc() {
    let dir = tempfile::tempdir().unwrap();
    write_workspace(dir.path(), "my-org.my-scope");
    let formatter = Formatter::new(Chalk::new(false));

    let initial = WorkspaceTrust::load(dir.path()).unwrap();
    assert!(!initial.opted_in);
    assert!(initial.format_list(&formatter).contains("scope-trust is off for this workspace."));

    initial.enable().unwrap();
    let enabled = WorkspaceTrust::load(dir.path()).unwrap();
    assert!(enabled.opted_in);
    assert!(enabled.configured.is_empty());
    let list_text = enabled.format_list(&formatter);
    assert!(list_text.contains("scope-trust is on."));
    assert!(list_text.contains("my-org.*"));
    assert!(list_text.contains("no scopes configured in workspace.jsonc."));

    enabled.add("acme.frontend").unwrap();
    let added = WorkspaceTrust::load(dir.path()).unwrap();
    assert_eq!(added.configured, vec!["acme.frontend".to_owned()]);
    assert!(added.format_list(&formatter).contains("acme.frontend"));

    added.remove("acme.frontend").unwrap();
    let removed = WorkspaceTrust::load(dir.path()).unwrap();
    assert!(removed.opted_in);
    assert!(removed.configured.is_empty());

    removed.disable().unwrap();
    let disabled = WorkspaceTrust::load(dir.path()).unwrap();
    assert!(!disabled.opted_in);
}
