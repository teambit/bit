use super::metadata;
use crate::js_json::Value as Js;
use serde_json::{Value, json};

#[test]
fn diverged_squash_records_per_component_main_scope() {
    let model = json!({"scope":"component.scope"});
    let mut lane = json!({"otherId":{"scope":"workspace.scope","name":"main"}});
    assert_eq!(
        metadata::squash_lane(&model, &lane).unwrap(),
        json!({"scope":"component.scope","name":"main"}),
    );
    assert_eq!(lane["otherId"]["scope"], "workspace.scope");
    assert!(metadata::squash_lane(&json!({}), &lane).is_err());
    lane["otherId"]["name"] = json!("incoming");
    assert_eq!(metadata::squash_lane(&model, &lane).unwrap(), lane["otherId"]);
}

#[test]
fn autosnap_upgrades_harmony_version_schema_without_rewriting_original() {
    let original = json!({"schema":"1.0.0","files":[],"log":{"date":"1","message":"initial"},"extensions":[],"flattenedDependencies":["scope/dep@1.0.0"]});
    let projected = metadata::current_schema(&original).unwrap();
    let object = metadata::object("Version", Some(&"a".repeat(40)), projected).unwrap();
    let fields: Js = serde_json::from_value(object["fields"].clone()).unwrap();
    let bytes = crate::snapshot_projection::serialize("Version", &fields, false).unwrap();
    let stored: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(stored["schema"], "2.0.0");
    assert_eq!(
        stored["flattenedDependencies"],
        json!([{"scope":"scope","name":"dep","version":"1.0.0"}]),
    );
    assert_eq!(original["schema"], "1.0.0");
    assert_eq!(original["flattenedDependencies"], json!(["scope/dep@1.0.0"]));
}

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

#[test]
fn snapshot_and_fast_forward_share_canonical_local_state_mutation() {
    let head = "c".repeat(40);
    for state in [
        json!({"custom":true}),
        json!({"custom":true,"versions":{head.clone():{"extra":"preserved","local":false}}}),
    ] {
        let input = json!({"state":state});
        let snapshot = metadata::model(&input, &head).unwrap();
        let fast_forward = super::local_model(&input, &head).unwrap();
        assert_eq!(snapshot, fast_forward);
        if input["state"]["versions"].is_null() {
            assert_eq!(snapshot["state"], json!({"versions":{head.clone():{"local":true}}}));
        } else {
            assert_eq!(snapshot["state"]["custom"], true);
            assert_eq!(
                snapshot["state"]["versions"][&head],
                json!({"extra":"preserved","local":true}),
            );
        }
    }
}

#[test]
fn main_merge_message_uses_component_scope_in_cross_scope_lane_workspace() {
    let model = json!({"scope":"component.scope"});
    let mut lane = json!({"otherId":{"scope":"workspace.scope","name":"main"}});
    assert_eq!(
        metadata::message_text(&model, Some(&lane), "").unwrap(),
        "merge component.scope/main",
    );
    lane["otherId"]["name"] = json!("feature");
    assert_eq!(
        metadata::message_text(&model, Some(&lane), "").unwrap(),
        "merge workspace.scope/feature",
    );
    assert_eq!(metadata::message_text(&model, Some(&lane), "custom").unwrap(), "custom");
}
