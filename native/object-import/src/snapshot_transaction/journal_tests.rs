use super::State;
use serde_json::{Value, json};

fn receipt(state: &mut State, output: &Value, next: usize) -> Value {
    state.receipt(json!({"token":output["token"],"revision":output["revision"],"completed":output["directive"]["count"],"failed":false,"nextCount":next})).unwrap()
}
#[test]
fn callbacks_and_per_component_effects_have_canonical_order() {
    let mut state = State::default();
    let mut output = state
        .begin(json!({"count":2,"soft":false}), "a".repeat(40), false)
        .unwrap();
    let mut effects = Vec::new();
    while output["directive"]["kind"] != "done" {
        effects.push((
            output["directive"]["kind"]
                .as_str()
                .unwrap()
                .to_owned(),
            output["directive"]["index"].as_u64().unwrap(),
        ));
        output = receipt(&mut state, &output, 2);
    }
    assert_eq!(
        &effects[5..9],
        &[
            ("addObjects".into(), 0),
            ("updateWorkspace".into(), 0),
            ("addObjects".into(), 1),
            ("updateWorkspace".into(), 1)
        ],
    );
    assert_eq!(effects.last().unwrap().0, "clearCache");
}

#[test]
fn callback_batch_resize_never_changes_singleton_staged_write() {
    let mut state = State::default();
    let mut output = state
        .begin(json!({"count":1}), "d".repeat(40), false)
        .unwrap();
    while output["directive"]["kind"] != "flattenDependencies" {
        output = receipt(&mut state, &output, 1);
    }
    output = receipt(&mut state, &output, 2);
    assert_eq!(output["directive"]["kind"], "addObjects");
    output = receipt(&mut state, &output, 2);
    output = receipt(&mut state, &output, 3);
    assert_eq!(output["directive"]["index"], 1);
    output = receipt(&mut state, &output, 3);
    output = receipt(&mut state, &output, 1);
    assert_eq!(output["directive"]["kind"], "stagedWrite");
    assert_eq!(output["directive"]["count"], 1);
}
#[test]
fn soft_tags_capture_lane_and_failure_is_terminal() {
    let mut state = State::default();
    let mut output = state
        .begin(json!({"count":1,"soft":true}), "b".repeat(40), false)
        .unwrap();
    for expected in ["preSnap", "prepareVersions", "captureLane", "softTag"] {
        output = receipt(&mut state, &output, 1);
        assert_eq!(output["directive"]["kind"], expected);
    }
    let failed =
        json!({"token":output["token"],"revision":output["revision"],"completed":0,"failed":true});
    let terminal = state.receipt(failed.clone()).unwrap();
    assert_eq!(terminal["directive"]["phase"], "softTag");
    assert!(state.receipt(failed).is_err());
}
#[test]
fn deletion_precedes_validation_and_replayed_receipts_decline() {
    let mut state = State::default();
    let first = state
        .begin(json!({"count":3}), "c".repeat(40), true)
        .unwrap();
    assert_eq!(first["directive"]["kind"], "deleteObjects");
    let next = receipt(&mut state, &first, 1);
    assert_eq!(next["directive"]["kind"], "validateObjects");
    assert!(
        state
            .receipt(json!({"token":first["token"],"revision":0,"completed":3,"failed":false}))
            .is_err(),
    );
}

#[test]
fn nested_journal_does_not_replace_outer_receipt_state() {
    let mut state = State::default();
    let outer = state
        .begin(json!({"count":1}), "e".repeat(40), false)
        .unwrap();
    let inner = state
        .begin(json!({"count":1,"soft":true}), "f".repeat(40), false)
        .unwrap();
    let advanced = receipt(&mut state, &inner, 1);
    assert_eq!(advanced["directive"]["kind"], "preSnap");
    let resumed = receipt(&mut state, &outer, 1);
    assert_eq!(resumed["directive"]["kind"], "preSnap");
}

#[test]
fn invalid_next_count_preserves_revision_and_directive() {
    let mut state = State::default();
    let first = state
        .begin(json!({"count":1}), "0".repeat(40), false)
        .unwrap();
    assert!(state.receipt(json!({"token":first["token"],"revision":0,"completed":1,"failed":false,"nextCount":4097})).is_err());
    let next = receipt(&mut state, &first, 1);
    assert_eq!(next["revision"], 1);
    assert_eq!(next["directive"]["kind"], "preSnap");
}
