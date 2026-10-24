//! Rename copies empty aspect config and stages deletion on main from a lane.
use super::aspect_config;
use serde_json::json;

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
