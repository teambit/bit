use super::prepare_hidden_metadata;
use crate::workspace::engine::{command::capture::Captured, status_models::comparison::Target};
use serde_json::json;

#[test]
fn model_only_projection_preserves_resolver_data_and_hydrates_package_names() {
    let dependency = json!({"scope":"scope","name":"dep","version":"a".repeat(40)});
    let version = json!({"extensions":[{"name":"teambit.envs/envs","config":{},"data":{"id":"teambit.harmony/node"}},{"name":"teambit.dependencies/dependency-resolver","config":{},"data":{"dependencies":[{"__type":"component","componentId":dependency,"packageName":"@scope/dep"}]}}],"dependencies":[{"id":dependency,"relativePaths":[]}],"devDependencies":[]});
    let captured = Captured {
        added: false,
        hidden: true,
        model_backed: false,
        target: Target {
            source_overlays: std::collections::HashMap::new(),
            source_overlay_root: None,
            identity: "scope/hidden".into(),
            version: "b".repeat(40),
            directory: String::new(),
            files: Vec::new(),
            current: version.clone(),
        },
        metadata: json!([]),
        files: json!([]),
    };
    let mut output = version.clone();
    prepare_hidden_metadata(&captured, &mut output).unwrap();
    assert_eq!(output["dependencies"][0]["packageName"], "@scope/dep");
    assert_eq!(output["extensions"], version["extensions"]);
    let mut changed = version;
    changed["extensions"][1]["config"] = json!({"policy":{"dependencies":{"pkg":"1"}}});
    prepare_hidden_metadata(&captured, &mut changed).unwrap();
    assert_eq!(changed["extensions"][1]["config"]["policy"]["dependencies"]["pkg"], "1");
}
