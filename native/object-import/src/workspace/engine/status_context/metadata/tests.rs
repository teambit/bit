use super::configuration;
use serde_json::json;
#[test]
fn recovery_admits_only_empty_builtin_component_configuration() {
    let value = json!({"componentId":{"scope":"scope.test","name":"component"},"propagate":false,"extensions":{"teambit.envs/envs":{},"teambit.semantics/schema":{},"teambit.dependencies/dependency-resolver":{}}});
    assert!(configuration(&value, true).is_ok());
    assert!(configuration(&value, false).is_err());
    let mut custom = value.clone();
    custom["extensions"]["teambit.envs/envs"] = json!({"env":"custom/env"});
    assert!(configuration(&custom, true).is_err());
    let mut unknown = value;
    unknown["extensions"]["custom/aspect"] = json!({});
    assert!(configuration(&unknown, true).is_err());
}
