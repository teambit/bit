use super::{extensions, ignored_issues};
use serde_json::json;

#[test]
fn accepts_the_settings_bit_writes_by_default() {
    let config = json!({
        "teambit.generator/generator": {"envs": []},
        "teambit.dependencies/dependency-resolver": {
            "allowScripts": {}, "rootComponents": true,
            "policy": {"dependencies": {"webpack": "^5.111.1"}, "peerDependencies": {}},
            "linkCoreAspects": true,
        },
        "teambit.workspace/workspace-config-files": {"enableWorkspaceConfigWrite": true},
    });
    assert!(extensions(&config).is_ok());
}

/// What `reInitWorkspace` of the e2e suite writes.
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

#[test]
fn declines_settings_that_change_what_harmony_does() {
    for config in [
        json!({"teambit.dependencies/dependency-resolver": {"linkCoreAspects": false}}),
        json!({"teambit.dependencies/dependency-resolver": {"packageManager": "teambit.dependencies/yarn"}}),
        json!({"teambit.generator/generator": {"envs": ["teambit.react/react-env"]}}),
        json!({"teambit.preview/preview": {"disabled": "yes"}}),
        json!({"teambit.preview/preview": {"maxChunkSize": 10}}),
        json!({"teambit.component/issues": {"ignoreIssues": "MissingDists"}}),
        // `NonExistIssueError`, which the Node.js CLI reports.
        json!({"teambit.component/issues": {"ignoreIssues": ["NoSuchIssue"]}}),
        json!({"teambit.component/issues": {"other": []}}),
    ] {
        assert!(extensions(&config).is_err(), "{config}");
    }
}
