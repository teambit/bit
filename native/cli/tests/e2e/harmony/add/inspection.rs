//! Inspect ([`show`], [`fragment`], [`policy`]) the actual published consumers of native-produced tracking records.
//!
//! Provides `bit show` and `bit status` helpers for asserting environment, policy, and issue parity after `bit add`.

use crate::{commands::add::support::node, helper::Helper};
use serde_json::Value;

/// Runs `bit show <id> --json` via `Node.js` ([`node`]) and returns the parsed JSON array [`Value`].
pub(super) fn show(helper: &Helper, id: &str) -> Value {
    let result = node(&helper.scopes.local_path, &format!("show {id} --json"));
    assert!(result.status.success(), "{}", result.stderr);
    serde_json::from_str(&result.stdout).unwrap()
}

/// Extracts the `"json"` payload of the `bit show --json` section matching `title`.
pub(super) fn fragment<'a>(show: &'a Value, title: &str) -> &'a Value {
    &show
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["title"] == title)
        .unwrap()["json"]
}

/// Returns the list of environment-sourced dependency IDs from `show`'s `configuration` section.
pub(super) fn policy(show: &Value) -> Vec<String> {
    fragment(show, "configuration")
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == "teambit.dependencies/dependency-resolver")
        .unwrap()["data"]["policy"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|row| row["source"] == "env")
        .map(|row| {
            row["dependencyId"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect()
}

/// Runs `bit status --json` natively and via `Node.js` ([`node`]), asserts parity, and returns the parsed JSON [`Value`].
pub(super) fn status(helper: &Helper) -> Value {
    let expected = node(&helper.scopes.local_path, "status --json");
    let actual = helper.native_run("status --json");
    assert!(actual.native, "{}", actual.trace);
    assert!(expected.status.success(), "{}", expected.stderr);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    serde_json::from_str(&actual.stdout).unwrap()
}

/// Returns the issue type names reported for component `name` in `status` (`componentsWithIssues`) via [`Value`] and [`status`].
pub(super) fn issue_types(status: &Value, name: &str) -> Vec<String> {
    let identity = format!("/{name}");
    let Some(row) = status["componentsWithIssues"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| {
            row["id"]
                .as_str()
                .is_some_and(|id| id.ends_with(&identity))
        })
    else {
        return Vec::new();
    };
    row["issues"]
        .as_array()
        .unwrap()
        .iter()
        .map(|issue| {
            issue["type"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect()
}
