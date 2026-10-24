use super::{Request, read};
use serde_json::{Value, json};

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
fn result(value: Value) -> Value {
    let request: Request = serde_json::from_value(value).unwrap();
    read(&request).unwrap().1
}
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
#[test]
fn missing_grammar_and_unrelated_histories_decline() {
    let mut input = fixture();
    input["semver"] = json!({});
    assert!(read(&serde_json::from_value(input).unwrap()).is_err());
    let mut input = fixture();
    input["histories"][0]["merge"]["noCommon"] = json!(true);
    assert!(read(&serde_json::from_value(input).unwrap()).is_err());
}

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
