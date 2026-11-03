//! Unit tests for workspace configuration [`extensions`] and [`ignored_issues`] validation ([`accepts_the_settings_bit_writes_by_default`], [`accepts_disabled_previews_and_ignored_issues`]) in `bit-object-import`.
//!
//! Checks default workspace settings, disabled previews, and issue ignore lists against workspace schemas.

use super::{extensions, ignored_issues};
use serde_json::json;

/// Verifies that [`extensions`] accepts default `workspace.jsonc` generator, dependency-resolver, and config-files settings.
#[test]
fn accepts_the_settings_bit_writes_by_default() {
    let config = json!({
        "teambit.generator/generator": {"envs": ["teambit.react/react-env"]},
        "teambit.dependencies/dependency-resolver": {
            "allowScripts": {}, "rootComponents": true,
            "policy": {"dependencies": {"webpack": "^5.111.1"}, "peerDependencies": {}},
            "linkCoreAspects": true,
        },
        "teambit.workspace/workspace-config-files": {"enableWorkspaceConfigWrite": true},
    });
    assert!(extensions(&config).is_ok());
}

/// Verifies that [`extensions`] and [`ignored_issues`] accept disabled previews and valid issue ignore lists (`reInitWorkspace`).
#[test]
fn accepts_disabled_previews_and_ignored_issues() {
    let config = json!({
        "teambit.preview/preview": {"disabled": true},
        "teambit.component/issues": {"ignoreIssues": ["MissingManuallyConfiguredPackages", "CircularDependencies"]},
    });
    assert!(extensions(&config).is_ok());
    assert_eq!(
        ignored_issues(&config).unwrap(),
        ["MissingManuallyConfiguredPackages", "CircularDependencies"],
    );
    assert!(ignored_issues(&json!({})).unwrap().is_empty());
}

/// Verifies that [`extensions`] rejects non-string generator envs, non-boolean preview flags, and unknown `ignoreIssues` entries.
#[test]
fn declines_settings_that_change_what_harmony_does() {
    for config in [
        json!({"teambit.generator/generator": {"envs": [{"id":"teambit.react/react-env"}]}}),
        json!({"teambit.preview/preview": {"disabled": "yes"}}),
        json!({"teambit.component/issues": {"ignoreIssues": "MissingDists"}}),
        // `NonExistIssueError`, which the Node.js CLI reports.
        json!({"teambit.component/issues": {"ignoreIssues": ["NoSuchIssue"]}}),
    ] {
        assert!(extensions(&config).is_err(), "{config}");
    }
}

/// Verifies that [`extensions`] accepts read-inert `teambit.dependencies/dependency-resolver` (`WorkspaceConfig`) installation settings without declining cold status ([`declines_settings_that_change_what_harmony_does`]).
#[test]
fn accepts_read_inert_resolver_options() {
    assert!(
        extensions(&json!({"teambit.dependencies/dependency-resolver": {
            "packageManager":"teambit.dependencies/yarn", "nodeLinker":"isolated",
            "linkCoreAspects":false, "overrides":{"lodash":"4.17.21"},
            "sideEffectsCache":true, "savePrefix":"~",
        }}))
        .is_ok(),
    );
}
