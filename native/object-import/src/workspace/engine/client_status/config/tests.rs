use super::extensions;
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

#[test]
fn declines_settings_that_change_what_harmony_does() {
    for config in [
        json!({"teambit.dependencies/dependency-resolver": {"linkCoreAspects": false}}),
        json!({"teambit.dependencies/dependency-resolver": {"packageManager": "teambit.dependencies/yarn"}}),
        json!({"teambit.generator/generator": {"envs": ["teambit.react/react-env"]}}),
    ] {
        assert!(extensions(&config).is_err(), "{config}");
    }
}
