//! Unit tests for status result [`Request`] modified component and [`read`] auto-tag computation.
//!
//! Verifies modified component classification and transitive auto-tag pending discovery via [`fixture`] and [`result`] ([`clean_main_and_modified_dependency_autotag`], [`invalid_component_is_reported_without_entering_the_autotag_graph`], [`detached_staged_labels_union_main_lineage_in_canonical_order`]).

use super::{Request, read};
use serde_json::{Value, json};

/// Builds a baseline status result [`Request`] JSON fixture with `scope/alpha` and dependent `scope/beta`.
fn fixture() -> Value {
    json!({"currentLaneId":"scope/main","targets":[
        {"identity":"scope/alpha","version":"1.0.0","modified":false,"issues":[],"dependencies":[]},
        {"identity":"scope/beta","version":"1.0.0","modified":false,"issues":[],"dependencies":["scope/alpha@1.0.0"]}
    ],"models":[
        {"scope":"scope","name":"alpha","head":"aaa","versions":{"1.0.0":"aaa"}},
        {"scope":"scope","name":"beta","head":"bbb","versions":{"1.0.0":"bbb"}}
    ],"histories":[
        {"identity":"scope/alpha","remoteHead":"aaa","status":{"sourceOnly":[],"targetOnly":[],"noCommon":false},"merge":{"sourceOnly":[],"targetOnly":[],"noCommon":false}},
        {"identity":"scope/beta","remoteHead":"bbb","status":{"sourceOnly":[],"targetOnly":[],"noCommon":false},"merge":{"sourceOnly":[],"targetOnly":[],"noCommon":false}}
    ],"semver":{"1.0.0":{"version":{"major":1,"minor":0,"patch":0,"prerelease":[]}},"aaa":{},"bbb":{}}})
}
/// Deserializes `value` as a status result [`Request`] and returns the [`read`] JSON payload.
fn result(value: Value) -> Value {
    let request: Request = serde_json::from_value(value).unwrap();
    read(&request).unwrap().1
}
/// Verifies that [`read`] marks modified components and propagates pending auto-tag status to dependents.
#[test]
fn clean_main_and_modified_dependency_autotag() {
    let input = fixture();
    assert_eq!(result(input.clone())["modifiedComponents"], json!([]));
    let mut modified = input;
    modified["targets"][0]["modified"] = json!(true);
    let output = result(modified);
    assert_eq!(output["modifiedComponents"], json!(["scope/alpha"]));
    assert_eq!(output["autoTagPendingComponents"], json!(["scope/beta"]));
}
/// Verifies that [`result`] reports `ComponentNotFoundInPath` in `invalidComponents` without adding the component to `autoTagPendingComponents`.
#[test]
fn invalid_component_is_reported_without_entering_the_autotag_graph() {
    let mut input = fixture();
    input["targets"][0]["modified"] = json!(true);
    input["targets"][1]["invalid"] = json!({"name":"ComponentNotFoundInPath","code":127,
        "isUserError":true,"path":"beta"});
    let output = result(input);
    assert_eq!(output["modifiedComponents"], json!(["scope/alpha"]));
    assert_eq!(output["autoTagPendingComponents"], json!([]));
    let expected = json!([
        {"id":"scope/beta","error":
            {"name":"ComponentNotFoundInPath","code":127,"isUserError":true,"path":"beta"}},
    ]);
    assert_eq!(output["invalidComponents"], expected);
}
/// Verifies that [`result`] unions `detachedHeads` with `main` branch lineage in canonical staged version order.
#[test]
fn detached_staged_labels_union_main_lineage_in_canonical_order() {
    let mut input = fixture();
    input["models"][0]["detachedHeads"] = json!({"heads":["ccc"]});
    input["histories"][0]["status"]["sourceOnly"] = json!(["ccc"]);
    input["histories"][0]["merge"]["sourceOnly"] = json!(["aaa", "ccc"]);
    let output = result(input);
    assert_eq!(
        output["stagedComponents"],
        json!([{"id":"scope/alpha","versions":["ccc","1.0.0"]}]),
    );
}
/// Verifies that [`result`] keeps `outdatedComponents` (remote ahead) and `mergePendingComponents` (diverged) mutually exclusive.
#[test]
fn remote_ahead_and_diverged_sections_are_exclusive() {
    let mut input = fixture();
    input["histories"][0]["remoteHead"] = json!("ccc");
    input["histories"][0]["status"]["targetOnly"] = json!(["ccc"]);
    input["histories"][0]["merge"]["targetOnly"] = json!(["ccc"]);
    assert_eq!(
        result(input.clone())["outdatedComponents"],
        json!([{"id":"scope/alpha","headVersion":"ccc","latestVersion":"1.0.0"}]),
    );
    input["histories"][0]["merge"]["sourceOnly"] = json!(["aaa"]);
    let output = result(input);
    assert_eq!(output["outdatedComponents"], json!([]));
    assert_eq!(output["mergePendingComponents"], json!(["scope/alpha"]));
}
/// Verifies that [`read`] declines when `semver` grammar entries are missing or `noCommon` is true.
#[test]
fn missing_grammar_and_unrelated_histories_decline() {
    let mut input = fixture();
    input["semver"] = json!({});
    assert!(read(&serde_json::from_value(input).unwrap()).is_err());
    let mut input = fixture();
    input["histories"][0]["merge"]["noCommon"] = json!(true);
    assert!(read(&serde_json::from_value(input).unwrap()).is_err());
}

/// Verifies that [`result`] via [`read`] on [`fixture`] on a non-`main` lane stages only lane-head components while keeping `main`-only components clean.
#[test]
fn current_lane_stages_only_lane_heads_and_keeps_main_components_clean() {
    let mut input = fixture();
    input["currentLaneId"] = json!("scope/study");
    input["targets"][0]["version"] = json!("ccc");
    input["targets"][1]["version"] = json!("bbb");
    input["models"][1]["versions"] = json!({});
    input["histories"][0]["laneHead"] = json!("ccc");
    input["histories"][0]["mainHead"] = json!("aaa");
    input["histories"][0]["status"]["sourceOnly"] = json!(["ccc"]);
    input["histories"][0]["merge"]["sourceOnly"] = json!(["ccc"]);
    input["semver"]["ccc"] = json!({});
    let output = result(input.clone());
    assert_eq!(output["currentLaneId"], "scope/study");
    assert_eq!(output["stagedComponents"], json!([{"id":"scope/alpha","versions":["ccc"]}]));
    assert_eq!(output["snappedComponents"], json!([]));
    assert_eq!(output["outdatedComponents"], json!([]));
    input["histories"][0]["status"]["sourceOnly"] = json!([]);
    input["histories"][0]["merge"]["sourceOnly"] = json!([]);
    assert_eq!(result(input)["stagedComponents"], json!([]));
}

/// Verifies that [`result`] partitions `ComponentsPendingImport` into `importPendingComponents` while keeping other errors in `invalidComponents`.
#[test]
fn pending_import_is_partitioned_from_other_invalid_components_in_input_order() {
    let mut input = fixture();
    input["targets"][0]["invalid"] = json!({"name":"ComponentsPendingImport","isUserError":true});
    input["targets"][1]["invalid"] = json!({"name":"ComponentNotFoundInPath","isUserError":true});
    let mut last = input["targets"][0].clone();
    last["identity"] = json!("scope/gamma");
    input["targets"]
        .as_array_mut()
        .unwrap()
        .push(last);
    let output = result(input);
    assert_eq!(output["importPendingComponents"], json!(["scope/alpha", "scope/gamma"]));
    assert_eq!(
        output["invalidComponents"],
        json!([
            {"id":"scope/beta","error":{"name":"ComponentNotFoundInPath","isUserError":true}},
        ]),
    );
    assert_eq!(output["autoTagPendingComponents"], json!([]));
    assert_eq!(output["modifiedComponents"], json!([]));
}

/// Verifies that [`result`] returns empty `modifiedComponents`, `stagedComponents`, and `invalidComponents` arrays when `targets` is empty.
#[test]
fn empty_targets_produce_clean_empty_status_sections() {
    let mut input = fixture();
    input["targets"] = json!([]);
    input["models"] = json!([]);
    input["histories"] = json!([]);
    let output = result(input);
    assert_eq!(output["modifiedComponents"], json!([]));
    assert_eq!(output["stagedComponents"], json!([]));
    assert_eq!(output["invalidComponents"], json!([]));
}
