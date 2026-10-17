use super::configuration;
use serde_json::json;
#[test]
fn environment_shapes_are_admitted_but_invalid_callbacks_decline() {
    let value = json!({"componentId":{"scope":"scope.test","name":"component"},"propagate":false,"extensions":{"teambit.envs/envs":{},"teambit.semantics/schema":{},"teambit.dependencies/dependency-resolver":{}}});
    assert!(configuration(&value, true).is_ok());
    assert!(configuration(&value, false).is_ok());
    let mut custom = value.clone();
    custom["extensions"]["teambit.envs/envs"] = json!({"env":"custom/env"});
    assert!(configuration(&custom, true).is_ok());
    custom["extensions"]["teambit.envs/envs"] = json!({"env":42});
    assert!(configuration(&custom, true).is_err());
    let mut unknown = value;
    unknown["extensions"]["custom/aspect"] = json!({});
    assert!(configuration(&unknown, true).is_ok());
    unknown["extensions"]["custom/aspect"] = json!({"unqualifiedCallback":true});
    assert!(configuration(&unknown, true).is_ok());
}
