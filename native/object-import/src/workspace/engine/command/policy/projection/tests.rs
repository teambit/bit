use super::{Defaults, dependencies, extensions};
use serde_json::{Value, json};

fn defaults() -> Defaults {
    serde_json::from_value(json!({"env":{"id":"teambit.harmony/node","data":{"type":"node","id":"teambit.harmony/node","icon":"node.svg"}},
        "policyEntries":[{"dependencyId":"@types/node","source":"env","hidden":false,"force":true,"lifecycleType":"dev","value":{"version":"22.10.5"}}],
        "componentRangePrefix":null,"devPatterns":{"config":[]},"devFiles":{"config":[]},
        "slotData":[
            {"id":"teambit.semantics/schema","data":{"disabled":false},"undefinedKeys":[]},
            {"id":"teambit.pkg/pkg","data":{"packageJsonModification":{"main":"dist/{main}.js","types":"{main}.ts"}},"undefinedKeys":[]},
            {"id":"teambit.preview/preview","data":{"doesScaling":true},"undefinedKeys":[]},
            {"id":"teambit.compositions/compositions","data":{"compositions":[]},"undefinedKeys":[]},
            {"id":"teambit.docs/docs","data":{},"undefinedKeys":["doc"]}]})).unwrap()
}

#[test]
fn default_load_replaces_dynamic_data_preserving_entry_order_and_unknown_data_fields() {
    let stored = json!([
        {"name":"teambit.docs/docs","config":{},"data":{"doc":{"obsolete":true},"preserved":true}},
        {"name":"teambit.envs/envs","config":{},"data":{"id":"teambit.harmony/node"}},
        {"name":"teambit.dependencies/dependency-resolver","config":{},"data":{"componentRangePrefix":"~"}}]);
    let state =
        json!({"entries":[],"components":[[],[],[]],"packages":[{},{"@types/node":"22.10.5"},{}]});
    let actual = extensions(&stored, &stored, &state, &defaults(), "@scope/alpha").unwrap();
    assert_eq!(actual[0]["name"], "teambit.docs/docs");
    assert_eq!(actual[0]["data"], json!({"preserved":true}));
    assert_eq!(actual[1]["data"]["type"], "node");
    assert!(actual[2]["data"].get("componentRangePrefix").is_none());
    assert_eq!(
        actual[2]["data"]["dependencies"],
        json!([{"id":"@types/node","version":"22.10.5","__type":"package","lifecycle":"dev","source":"env","hidden":false}]),
    );
    assert_eq!(actual.as_array().unwrap().len(), 8);
}

#[test]
fn dependency_serialization_preserves_component_first_deduplication_and_canonical_field_order() {
    let state = json!({"entries":[{"identity":"scope/dep@1.0.0","packageName":"@scope/dep","versionRange":"^1.0.0"}],
        "components":[[0],[0],[]],"packages":[{"pkg":"2.0.0"},{"pkg":"3.0.0","@types/node":"22.10.5"},{}]});
    let actual = dependencies(&state, &defaults().policy_entries).unwrap();
    assert_eq!(actual.len(), 3);
    assert_eq!(actual[0]["lifecycle"], "runtime");
    assert_eq!(actual[1]["version"], "2.0.0");
    let fields = actual[0]
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>();
    assert_eq!(
        fields,
        vec![
            "id",
            "version",
            "versionRange",
            "__type",
            "lifecycle",
            "source",
            "componentId",
            "isExtension",
            "packageName"
        ],
    );
    let mut unsupported = state;
    unsupported["entries"][0]["packageName"] = Value::Null;
    assert!(dependencies(&unsupported, &[]).is_err());
}

#[test]
fn passive_deprecation_preserves_config_without_adding_a_default_callback_slot() {
    let stored =
        json!([{"name":"teambit.component/deprecation","config":{"deprecate":true},"data":{}}]);
    let state = json!({"entries":[],"components":[[],[],[]],"packages":[{},{},{}]});
    let output = extensions(&stored, &stored, &state, &defaults(), "@scope/component").unwrap();
    assert_eq!(output[0], stored[0]);
    assert_eq!(super::CORES.len(), 8);
    assert_eq!(super::configuration_cores().len(), 11);
    assert!(super::entries(&stored).is_ok());
    let ranged = json!([{"name":"teambit.component/deprecation","config":{"range":"*"}}]);
    assert!(super::entries(&ranged).is_err());
    let mut invalid_defaults = defaults();
    invalid_defaults.slot_data.push(
        json!({"id":"teambit.component/deprecation","data":{},"undefinedKeys":[]}),
    );
    assert!(extensions(&stored, &stored, &state, &invalid_defaults, "@scope/component").is_err());
}

#[test]
fn removal_aspect_requires_a_supported_soft_remove_configuration() {
    let removed = json!([{"name":"teambit.component/remove","config":{"removed":true},"data":{}}]);
    assert!(super::entries(&removed).is_ok());
    let unsupported =
        json!([{"name":"teambit.component/remove","config":{"removed":false},"data":{}}]);
    assert!(super::entries(&unsupported).is_err());
}

#[test]
fn stored_builder_artifacts_are_passive_metadata_not_a_load_callback() {
    let stored = json!([{"name":"teambit.pipelines/builder","config":{},"data":{"artifacts":[{"files":[{"relativePath":"dist/index.js","file":"a".repeat(40)}]}]}}]);
    let state = json!({"entries":[],"components":[[],[],[]],"packages":[{},{},{}]});
    let output = extensions(&stored, &stored, &state, &defaults(), "@scope/component").unwrap();
    assert_eq!(output[0], stored[0]);
    assert!(super::entries(&stored).is_ok());
    let configured = json!([{"name":"teambit.pipelines/builder","config":{"pipeline":"custom"}}]);
    assert!(super::entries(&configured).is_err());
    let mut callbacks = defaults();
    callbacks.slot_data.push(
        json!({"id":"teambit.pipelines/builder","data":{},"undefinedKeys":[]}),
    );
    assert!(extensions(&stored, &stored, &state, &callbacks, "@scope/component").is_err());
}
