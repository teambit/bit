use super::{Baseline, Prepared, Row, activate_inactive, workspace_id};
use serde_json::{Value, json};

fn row(identity: &str, ours_conflict: bool) -> Row {
    Row {
        identity: identity.into(),
        baseline: Baseline {
            directory: identity.into(),
            version: "1.0.0".into(),
            current: Value::Null,
            versions: [Value::Null, Value::Null, Value::Null],
            package_name: identity.into(),
            scope_only: false,
        },
        files: Vec::new(),
        merged: json!({}),
        projected: Value::Null,
        ours_conflict,
        fast_forward: false,
        receipts: super::Receipts::default(),
    }
}

#[test]
fn projected_workspace_activates_written_inactive_targets_without_excluded_or_keep_ours_rows() {
    let mut context = json!({"targets":[{"identity":"scope/active"}],"lane":{"inactiveTargets":[
        {"identity":"scope/written","directory":"written","version":"1.0.0"},
        {"identity":"scope/excluded","directory":"excluded"},
        {"identity":"scope/ours","directory":"ours"}
    ],"addedTargets":[{"identity":"scope/new","directory":"new","version":"2.0.0"}]}});
    let mut policy = Prepared::new();
    policy.rows =
        vec![row("scope/written", false), row("scope/ours", true), row("scope/new", false)];
    assert_eq!(super::workspace_count(&context, Some(&policy)).unwrap(), 3);
    activate_inactive(&policy, &mut context).unwrap();
    activate_inactive(&policy, &mut context).unwrap();
    assert_eq!(
        context["targets"],
        json!([
            {"identity":"scope/active"},
            {"identity":"scope/written","directory":"written","version":"1.0.0"},
            {"identity":"scope/new","directory":"new","version":"2.0.0"}
        ]),
    );
}

#[test]
fn merged_scope_config_finds_versioned_aspect_by_unversioned_identity() {
    let current = json!([
        {"extensionId":{"scope":"scope","name":"env/provider","version":"1.0.0"},
         "config":{"before":true},"data":{}},
        {"name":"teambit.envs/envs","config":{},"data":{}}
    ]);
    let versions = [json!({"extensions":[]}), json!({"extensions":[]}), json!({"extensions":[]})];
    let merged = json!({"scope/env/provider":{"after":true}});
    let selected = super::scope::apply(&current, &merged, &versions).unwrap();
    assert_eq!(selected.as_array().unwrap().len(), 2);
    assert_eq!(selected[0]["config"], json!({"after":true}));
    assert_eq!(selected[0]["extensionId"]["version"], "1.0.0");
}

#[test]
fn scope_configuration_merge_preserves_stored_docs_data() {
    let current =
        json!([{"name":"teambit.docs/docs","config":{},"data":{"doc":{"description":"stored"}}}]);
    let versions = [json!({"extensions":[]}), json!({"extensions":[]}), json!({"extensions":[]})];
    let selected =
        super::scope::apply(&current, &json!({"teambit.docs/docs":{}}), &versions).unwrap();
    assert_eq!(selected[0]["data"]["doc"]["description"], "stored");
}

#[test]
fn workspace_aspect_identity_keeps_version_for_added_other_lane_config() {
    let workspace = workspace_id(&json!({"identity":"scope/env/install-compat",
        "version":"0.0.1"}))
    .unwrap();
    assert_eq!(workspace["base"], "scope/env/install-compat");
    assert_eq!(workspace["legacy"], "scope/env/install-compat@0.0.1");
    assert_eq!(workspace["version"], "0.0.1");
    let unversioned = workspace_id(&json!({"identity":"scope/env/install-compat"})).unwrap();
    assert_eq!(unversioned["legacy"], "scope/env/install-compat");
}

#[test]
fn conflict_aspect_text_accepts_object_extension_id() {
    let mut policy = Prepared::new();
    let mut row = row("scope/comp", false);
    row.receipts.configuration = json!({
        "input": {"currentLabel": "HEAD", "otherLabel": "incoming"},
        "result": {
            "configRows": [{
                "extensionId": {"scope": "scope", "name": "env/custom", "version": "0.1.0"},
                "conflict": {
                    "kind": "basic",
                    "current": {"value": {"enabled": true}},
                    "other": {"value": {"enabled": false}}
                }
            }]
        }
    });
    policy.rows = vec![row];
    let dir = tempfile::tempdir().unwrap();
    let results = super::conflicts::prepare(&mut policy, dir.path()).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["compIdStr"], "scope/comp");
}
