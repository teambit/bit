//! Unit tests for `bit refactor` [`Action`] CLI subcommand parsing ([`parse_options`]) and package-name import rewriting ([`replace_package_name`]).
//!
//! Verifies [`Failure`] reporting, [`extract_version_package_name`], and [`prepare_bare_scope_dependency_name`].

use super::{
    Action, Failure, extract_version_package_name, parse_options,
    prepare_bare_scope_dependency_name, replace_package_name,
};
use serde_json::json;
use std::ffi::OsString;

/// Parses `words` as [`OsString`] CLI arguments through [`parse_options`].
fn parse(words: &[&str]) -> Option<Action> {
    let args = words
        .iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    parse_options(&args)
}

/// Verifies `bit refactor` CLI parsing for `dependency-name` and unrecognized subcommands.
#[test]
fn parses_dependency_name_and_unrecognized_subcommands() {
    assert_eq!(
        parse(&["refactor", "dependency-name", "@scope/old", "new-comp", "--no-color"]),
        Some(Action::DependencyName {
            old_id: "@scope/old".to_owned(),
            new_id: "new-comp".to_owned(),
        }),
    );
    assert_eq!(
        parse(&["refactor", "unknown-sub", "--no-color"]),
        Some(Action::Unrecognized("unknown-sub".to_owned())),
    );
    assert_eq!(parse(&["refactor"]), None);
    assert_eq!(parse(&["refactor", "--help"]), None);
    assert_eq!(parse(&["refactor", "dependency-name", "only-one"]), None);
}

/// Verifies that [`extract_version_package_name`] reads `data.packageName` from the dependency-resolver extension.
#[test]
fn extracts_package_name_from_version_extensions() {
    let ver = json!({
        "extensions": [
            {
                "name": "teambit.dependencies/dependency-resolver",
                "data": { "packageName": "@org/my-scope.comp1" }
            }
        ]
    });
    assert_eq!(extract_version_package_name(&ver).as_deref(), Some("@org/my-scope.comp1"));
}

/// Verifies [`replace_package_name`] across single, double, tilde, and subpath imports, and [`prepare_bare_scope_dependency_name`].
#[test]
fn replaces_single_double_tilde_and_subpath_package_imports() {
    let source = r#"
import a from '@scope/old';
import b from "@scope/old/sub/path";
@import '~@scope/old/styles.scss';
const keep = '@scope/older';
"#;
    let replaced =
        replace_package_name(source, "@scope/old", "@scope/new").ok().unwrap_or_default();
    assert!(replaced.contains("from '@scope/new';"));
    assert!(replaced.contains(r#"from "@scope/new/sub/path";"#));
    assert!(replaced.contains("'~@scope/new/styles.scss'"));
    assert!(replaced.contains("'@scope/older'"));

    let temp = tempfile::tempdir().unwrap();
    let ok = prepare_bare_scope_dependency_name(temp.path(), "@scope/old", "@scope/new").unwrap();
    assert_eq!(ok, "the following components have been changed (@scope/old => @scope/new):\n");
    assert!(matches!(
        prepare_bare_scope_dependency_name(temp.path(), "@scope/same", "@scope/same"),
        Err(Failure::User(msg)) if msg.contains("are the same"),
    ));
}

#[test]
fn extract_version_package_name_returns_none_when_extension_is_absent() {
    assert_eq!(extract_version_package_name(&json!({"extensions": []})), None);
}
