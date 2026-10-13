use super::metadata;
use crate::js_json::Value as Js;
use serde_json::{Value, json};

#[test]
fn model_projection_keeps_existing_local_tags_and_adds_snap_without_version_tag() {
    let model = json!({"name":"alpha","scope":"scope","versions":{"1.0.0":"a".repeat(40)},
        "lang":"javascript","deprecated":false,"bindingPrefix":"@scope","remotes":[],"schema":"2.0.0",
        "state":{"versions":{"1.0.0":{"local":true}}},"head":"a".repeat(40)});
    let updated = metadata::model(&model, &"b".repeat(40)).unwrap();
    assert_eq!(updated["versions"], model["versions"]);
    assert_eq!(
        updated["state"]["versions"]
            .as_object()
            .unwrap()
            .len(),
        2,
    );
    let object = metadata::object("Component", None, updated).unwrap();
    let fields: Js = serde_json::from_value(object["fields"].clone()).unwrap();
    let bytes = crate::snapshot_projection::serialize("Component", &fields, false).unwrap();
    let actual: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(actual["remotes"], json!([]));
    assert!(actual.get("detachedHeads").is_none());
    assert_eq!(actual["head"], "b".repeat(40));
}

#[test]
fn snapshot_version_projection_preserves_extension_config_and_order() {
    let object=metadata::object("Version",Some(&"a".repeat(40)),json!({"files":[],
        "log":{"date":"1","message":"merge scope/main"},"extensions":[{"name":"teambit.envs/envs","config":{},"data":{"id":"teambit.harmony/node"}}]})).unwrap();
    let fields: Js = serde_json::from_value(object["fields"].clone()).unwrap();
    let bytes = crate::snapshot_projection::serialize("Version", &fields, false).unwrap();
    assert_eq!(
        String::from_utf8(bytes).unwrap(),
        r#"{"files":[],"log":{"message":"merge scope/main","date":"1"},"extensions":[{"config":{},"data":{"id":"teambit.harmony/node"},"name":"teambit.envs/envs"}]}"#,
    );
}

#[test]
fn merged_application_registration_files_decline_before_allocation() {
    for path in ["apps/server.node-app.ts", "client.react-app.js", "custom.bit-app.mjs"] {
        assert!(metadata::no_application_files(&[json!({"relativePath":path})]).is_err());
    }
    assert!(metadata::no_application_files(&[json!({"relativePath":"index.js"})]).is_ok());
}
