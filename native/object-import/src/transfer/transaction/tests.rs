use crate::transfer::{State, apply};
use serde_json::{Value, json};

fn initialize(state: &mut State, resume: bool) -> Value {
    apply("transferTransactionInitialize",&json!({"scopes":["one.scope","two.scope","three.scope"],"clientId":"same-client","resuming":resume}),state).unwrap()
}
fn receipt(state: &mut State, previous: &Value, success: bool) -> Value {
    apply(
        "transferTransactionReceipt",
        &json!({"token":previous["token"],"revision":previous["revision"],"success":success}),
        state,
    )
    .unwrap()
}
#[test]
fn failed_upload_cleans_only_prior_acknowledged_remotes() {
    let mut state = State::default();
    let first = initialize(&mut state, false);
    let second = receipt(&mut state, &first, true);
    let failed = receipt(&mut state, &second, false);
    assert_eq!(failed["directive"], json!({"kind":"cleanup","indices":[0],"reason":"push"}));
    let terminal = receipt(&mut state, &failed, true);
    assert_eq!(terminal["directive"]["kind"], "failed");
    assert!(
        apply(
            "transferTransactionReceipt",
            &json!({"token":first["token"],"revision":0,"success":true}),
            &mut state
        )
        .is_err(),
    );
}
#[test]
fn fresh_validation_failure_cleans_all_but_resume_never_cleans() {
    let mut state = State::default();
    let mut next = initialize(&mut state, false);
    for _ in 0..3 {
        next = receipt(&mut state, &next, true);
    }
    assert_eq!(next["directive"]["kind"], "validate");
    next = receipt(&mut state, &next, false);
    assert_eq!(next["directive"], json!({"kind":"cleanup","indices":[0,1,2],"reason":"validate"}));
    next = initialize(&mut state, true);
    assert_eq!(next["directive"]["kind"], "validate");
    next = receipt(&mut state, &next, false);
    assert_eq!(next["directive"], json!({"kind":"failed","indices":[],"reason":"validate"}));
}
#[test]
fn persist_retries_exactly_three_times_then_preserves_pending_dirs() {
    let mut state = State::default();
    let init = initialize(&mut state, true);
    let mut next = receipt(&mut state, &init, true);
    for attempt in 1..=3 {
        assert_eq!(next["directive"]["attempt"], attempt);
        next = receipt(&mut state, &next, false);
    }
    assert_eq!(next["directive"], json!({"kind":"failed","indices":[],"reason":"persist"}));
}
#[test]
fn successful_persist_series_and_stale_reinitialization_never_repeat_acks() {
    let mut state = State::default();
    let old = initialize(&mut state, true);
    let current = initialize(&mut state, true);
    assert_ne!(old["token"], current["token"]);
    assert!(
        apply(
            "transferTransactionReceipt",
            &json!({"token":old["token"],"revision":0,"success":true}),
            &mut state
        )
        .is_err(),
    );
    let mut next = receipt(&mut state, &current, true);
    for index in 0..3 {
        assert_eq!(next["directive"]["indices"], json!([index]));
        next = receipt(&mut state, &next, true);
    }
    assert_eq!(next["directive"], json!({"kind":"done","indices":[]}));
}
