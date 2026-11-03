//! Rename copies empty aspect config and stages deletion on main from a lane.
//! These tests verify `.bitmap` [`aspect_config`] eligibility ([`renamed_component_configs_allow_empty_core_entries_and_update_main_removal`]) after rename in `bit-object-import`.
//!
//! Confirms that empty core aspect entries and `removeOnMain` boolean flags are validated accurately.
use super::aspect_config;
use serde_json::json;

/// Verifies that [`aspect_config`] accepts empty core aspect objects (`teambit.component/remove`, `teambit.envs/envs`, `teambit.component/issues`) and boolean `removeOnMain` flags on `.bitmap` (`BitMap`).
#[test]
fn renamed_component_configs_allow_empty_core_entries_and_update_main_removal() {
    for name in ["teambit.component/remove", "teambit.envs/envs", "teambit.component/issues"] {
        assert!(aspect_config(
            "teambit.envs/envs",
            &json!({"env":"teambit.harmony/aspect","__specific":true})
        ));
        assert!(aspect_config(name, &json!({})));
    }
    assert!(aspect_config(
        "teambit.component/remove",
        &json!({"removed":true,"removeOnMain":true})
    ));
    assert!(!aspect_config(
        "teambit.component/remove",
        &json!({"removed":true,"removeOnMain":"true"})
    ));
    assert!(!aspect_config("teambit.component/remove", &json!({"removed":true,"unexpected":true})));
}
