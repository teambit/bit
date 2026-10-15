use super::State;
use serde_json::{Value, json};

fn input(reset: bool) -> Value {
    json!({"component":{"id":"scope/name@1.0.0","idWithoutVersion":"scope/name","componentVersion":"1.0.0","hasBitmap":true,"currentExists":true,"isRemoved":false},"model":{"hasMainHead":true},"options":{"reset":reset,"head":false,"main":false,"latest":false,"forceOurs":false,"forceTheirs":false,"revert":false,"loadStash":false}})
}
fn receipt(state: &mut State, previous: &Value, value: &Value) -> Value {
    state.receipt(json!({"token":previous["token"],"revision":previous["revision"],"observation":previous["directive"]["observation"],"value":value})).expect("valid receipt")
}
#[test]
fn reset_observes_unmerged_and_stops_before_target_removal_when_unmodified() {
    let mut state = State::default();
    let output = state
        .begin(&input(true))
        .expect("begin");
    assert_eq!(output["directive"]["observation"], "unmerged");
    let output = receipt(&mut state, &output, &json!(true));
    assert_eq!(output["directive"]["observation"], "resolveTarget");
    let output = receipt(&mut state, &output, &json!("1.0.0"));
    let output = receipt(&mut state, &output, &json!({"value":"1.0.0","hasBitmap":true}));
    assert_eq!(output["directive"]["observation"], "modified");
    let output = receipt(&mut state, &output, &json!({"modified":false,"isRemoved":false}));
    assert_eq!(output["directive"]["kind"], "failure");
    assert_eq!(output["directive"]["legitimate"], true);
    assert!(state.records.is_empty());
}
#[test]
fn invalid_receipt_keeps_checkpoint_available_and_terminal_is_consumed() {
    let mut state = State::default();
    let output = state
        .begin(&input(false))
        .expect("begin");
    let invalid = json!({"token":output["token"],"revision":0,"observation":"unmerged","value":"not boolean"});
    assert!(state.receipt(invalid).is_err());
    let output = receipt(&mut state, &output, &json!(true));
    assert_eq!(output["revision"], 1);
    assert_eq!(output["directive"]["kind"], "failure");
    assert!(
        state
            .receipt(
                json!({"token":output["token"],"revision":1,"observation":"unmerged","value":false})
            )
            .is_err(),
    );
}
#[test]
fn current_version_is_observed_after_resolution_and_drives_merge() {
    let mut state = State::default();
    let output = state
        .begin(&input(false))
        .expect("begin");
    let output = receipt(&mut state, &output, &json!(false));
    let output = receipt(&mut state, &output, &json!("2.0.0"));
    let output = receipt(&mut state, &output, &json!({"value":"1.1.0","hasBitmap":true}));
    let output = receipt(&mut state, &output, &json!(false));
    assert_eq!(output["directive"]["version"], "1.1.0");
    let output = receipt(&mut state, &output, &json!({"modified":true,"isRemoved":false}));
    let output = receipt(&mut state, &output, &json!({"removed":false,"hasBitmap":true}));
    assert_eq!(output["directive"], json!({"kind":"target","version":"2.0.0","merge":true}));
}

#[test]
fn revert_replaces_modified_files_without_planning_a_merge() {
    let mut state = State::default();
    let mut request = input(false);
    request["options"]["revert"] = json!(true);
    request["options"]["version"] = json!("0.0.1");
    let output = state.begin(&request).expect("begin");
    let output = receipt(&mut state, &output, &json!(false));
    let output = receipt(&mut state, &output, &json!("0.0.1"));
    assert_eq!(output["directive"]["observation"], "hasVersion");
    let output = receipt(&mut state, &output, &json!(true));
    let output = receipt(&mut state, &output, &json!({"value":"1.0.0","hasBitmap":true}));
    let output = receipt(&mut state, &output, &json!(false));
    let output = receipt(&mut state, &output, &json!({"modified":true,"isRemoved":false}));
    let output = receipt(&mut state, &output, &json!({"removed":false,"hasBitmap":true}));
    assert_eq!(output["directive"], json!({"kind":"target","version":"0.0.1","merge":false}));
}
#[test]
fn unresolved_target_does_not_advance_or_repeat_earlier_observations() {
    let mut state = State::default();
    let output = state
        .begin(&input(false))
        .expect("begin");
    let output = receipt(&mut state, &output, &json!(false));
    assert!(state.receipt(json!({"token":output["token"],"revision":1,"observation":"resolveTarget","value":null})).is_err());
    let output = receipt(&mut state, &output, &json!("2.0.0"));
    assert_eq!(output["revision"], 2);
    assert_eq!(output["directive"]["observation"], "currentVersion");
}
