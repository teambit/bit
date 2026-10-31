use super::{State, apply};
use serde_json::{Value, json};

fn begin(state: &mut State, mode: &str, count: usize) -> Value {
    apply("mergeTransactionBegin", json!({"mode":mode,"count":count}), state).expect("begin")
}
fn receipt(state: &mut State, previous: &Value, next: usize) -> Value {
    apply("mergeTransactionReceipt", json!({"token":previous["token"],"revision":previous["revision"],"phase":previous["directive"]["phase"],"index":previous["directive"]["index"],"completed":previous["directive"]["count"],"nextCount":next}), state).expect("receipt")
}
#[test]
fn invalid_receipt_keeps_revision_and_live_serial_batch() {
    let mut state = State::default();
    let first = begin(&mut state, "apply", 2);
    let invalid = json!({"token":first["token"],"revision":0,"phase":"prompt","index":0,"completed":1,"nextCount":4097});
    assert!(apply("mergeTransactionReceipt", invalid, &mut state).is_err());
    let results = receipt(&mut state, &first, 1);
    let first_apply = receipt(&mut state, &results, 2);
    assert_eq!(first_apply["directive"]["phase"], "apply");
    let second_apply = receipt(&mut state, &first_apply, 3);
    assert_eq!(second_apply["directive"]["index"], 1);
    let write = receipt(&mut state, &second_apply, 1);
    assert_eq!(write["directive"], json!({"phase":"writeMany","index":0,"count":1}));
}
#[test]
fn empty_apply_skips_serial_and_terminal_owner_lives_until_finish() {
    let mut state = State::default();
    let mut output = begin(&mut state, "apply", 0);
    output = receipt(&mut state, &output, 1);
    output = receipt(&mut state, &output, 0);
    assert_eq!(output["directive"]["phase"], "writeMany");
    while output["directive"]["phase"] != "done" {
        output = receipt(&mut state, &output, 1);
    }
    let token = output["token"].as_str().expect("token");
    state.journal.verify_retained(token, 0).expect("retained owner");
    assert!(state.journal.verify(token, 0).is_err());
    apply("mergeTransactionFinish", json!({"token":token}), &mut state).expect("finish");
    assert!(state.journal.verify_retained(token, 0).is_err());
}
#[test]
fn finishing_parent_retires_completed_and_incomplete_children() {
    let mut state = State::default();
    let parent = begin(&mut state, "lane", 1);
    let child = apply(
        "mergeTransactionBegin",
        json!({"mode":"status","count":1,"parentToken":parent["token"]}),
        &mut state,
    )
    .expect("child");
    apply("mergeTransactionFinish", json!({"token":parent["token"]}), &mut state)
        .expect("finish parent");
    assert!(
        state.journal
            .verify_retained(child["token"].as_str().expect("child token"), 0)
            .is_err(),
    );
}
#[test]
fn dependency_snap_selection_dedupes_hash_and_preserves_missing_duplicates() {
    let hash = "1".repeat(40);
    let other = "2".repeat(40);
    let input = json!({"owner":{"scope":"scope","name":"owner"},"checked":[other],"dependencies":[{"scope":"scope","name":"first","version":hash},{"scope":"scope","name":"second","version":hash},{"scope":"else","name":"third","version":other},{"scope":"scope","name":"tag","version":"1.0.0"}]});
    assert_eq!(
        super::dependencies::candidates(&input).expect("candidates"),
        json!({"selected":[0],"checked":[hash]}),
    );
    let string_input = json!({"owner":"scope/owner@0.0.1","checked":[other],"dependencies":[format!("scope/first@{hash}"),{"id":format!("scope/second@{hash}")},format!("else/third@{other}"),"scope/tag@1.0.0"]});
    assert_eq!(
        super::dependencies::candidates(&string_input).expect("string candidates"),
        json!({"selected":[0],"checked":[hash]}),
    );
    assert_eq!(
        super::dependencies::missing(&json!({"candidates":[hash,hash,other],"existing":[other]}))
            .expect("missing"),
        json!({"missing":[0,1]}),
    );
}
#[test]
fn completion_order_only_reorders_async_push_categories() {
    let groups = json!([{"stage":"currentUpdated","loads":[{"row":1},{"row":3}]},{"stage":"modified","loads":[{"row":0},{"row":2}]}]);
    let observed = json!({"groups":[{"stage":"currentUpdated","order":[3,1]},{"stage":"modified","order":[0,2]}]});
    assert_eq!(
        super::order::permutation(&observed, groups.as_array().expect("groups"), 4)
            .expect("permutation"),
        vec![0, 3, 2, 1],
    );
    let bad = json!({"groups":[{"stage":"currentUpdated","order":[3,1]},{"stage":"modified","order":[2,0]}]});
    assert!(super::order::permutation(&bad, groups.as_array().expect("groups"), 4).is_err());
}

fn observe(state: &mut State, previous: &Value, value: Value) -> Value {
    let mut input = json!({"token":previous["token"],"revision":previous["revision"],"observe":previous["directive"]["observe"]});
    input["value"] = value;
    apply("mergeStatusReceipt", input, state).expect("observation")
}

#[test]
fn removed_lane_observes_current_alias_without_remove_from_main_callback() {
    let mut state = State::default();
    let owner = begin(&mut state, "status", 1);
    let mut status = apply("mergeStatusBegin",json!({"token":owner["token"],"index":0,"id":"scope/name@1.0.0","idWithoutVersion":"scope/name","hasConsumer":true,"hasWorkspace":true}),&mut state).expect("status child");
    status = observe(&mut state, &status, json!({"present":true}));
    status = observe(&mut state, &status, json!({"present":false}));
    status = observe(
        &mut state,
        &status,
        json!({"removed":true,"onLane":true,"bitmapPresent":true,"currentLanePresent":true}),
    );
    assert_eq!(status["directive"], json!({"observe":"currentId","selector":"bitmap"}));
    status = observe(&mut state, &status, json!({"present":false}));
    status = observe(
        &mut state,
        &status,
        json!({"error":{"kind":"other","message":"unused target-only traversal error"}}),
    );
    assert_eq!(status["result"], json!({"action":"target","shouldBeRemoved":true}));
}
#[test]
fn dependency_outcome_does_not_request_head_for_empty_or_included_dependencies() {
    assert_eq!(
        super::dependencies::outcome(&json!({"hasDependencies":false,"includeDeps":false}))
            .expect("empty"),
        json!({"action":"none"}),
    );
    assert_eq!(
        super::dependencies::outcome(&json!({"hasDependencies":true,"includeDeps":true}))
            .expect("include"),
        json!({"action":"add"}),
    );
    assert!(
        super::dependencies::outcome(&json!({"hasDependencies":true,"includeDeps":false})).is_err(),
    );
}
