use super::{
    super::{PreparedPlan, bitmap, history, planning, repository, scratch},
    Apply, Operation, Record, Retained, State, apply, proof, restore,
};
use serde_json::json;
use std::{fs, path::Path};
fn restored(root: &Path, captured: proof::Proof) -> State {
    let bitmap = fs::read(root.join(".bitmap")).unwrap();
    let mut restore = restore::prepare(root, Operation::ComponentAbort, &mut Vec::new()).unwrap();
    restore.items.push(".bitmap file".into());
    let plan = planning::Planned {
        captured: Vec::new(),
        transitions: crate::checkout_transition::State::default(),
        history: history::State::default(),
        materials: Vec::new(),
        directories: Vec::new(),
        result: json!({}),
        merge: None,
    };
    let record = Record {
        request: serde_json::from_value(json!({"root":root,"home":root,"globalRemotesFile":root.join("remotes"),"operation":"checkout","options":{"to":"reset","all":true,"skipDependencyInstallation":true}})).unwrap(),
        context: json!({}), targets: Vec::new(), repository: repository::Repository::new(root,None),
        proofs: vec![captured], token: "retained-token".into(), history: history::State::default(),
        planned: Some(PreparedPlan { plan, bitmap:bitmap::prepare_bytes(root,bitmap,&json!({}),&[],&[]).unwrap(),snap_bitmap:None,reset_config:None }),
    };
    State {
        recovery: Some(Retained {
            record,
            operation: Operation::LaneAbort,
            restore,
            pending: json!([]),
            result: json!({}),
            restored: true,
            restored_file_id: Some("2026-10-14-1-2-3".into()),
        }),
        ..State::default()
    }
}
#[test]
fn stale_source_after_restore_allows_only_authenticated_no_write_error_receipt() {
    let directory = scratch::Directory::create().unwrap();
    let root = &directory.0;
    fs::write(root.join(".bitmap"), br#"{"$schema-version":"17.0.0"}"#).unwrap();
    fs::write(root.join("workspace.jsonc"), b"{}").unwrap();
    let source = root.join("index.js");
    fs::write(&source, b"before").unwrap();
    let captured = proof::content(&source, b"before");
    let mut state = restored(root, captured.clone());
    fs::write(&source, b"after").unwrap();
    let input:Apply=serde_json::from_value(json!({"token":"retained-token","fileId":"2026-10-14-1-2-3","dependencyReadSet":[captured],"checkoutError":{"message":"dependency capture changed"}})).unwrap();
    let result = apply(&input, &mut state).unwrap().1;
    assert_eq!(result["result"]["checkoutError"]["message"], "dependency capture changed");
    assert_eq!(fs::read(&source).unwrap(), b"after");
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), br#"{"$schema-version":"17.0.0"}"#);
    assert!(!root.join(".bit").exists());
    let mut state = restored(root, captured.clone());
    let normal = Apply { checkout_error: None, ..input };
    assert!(apply(&normal, &mut state).is_err());
    let mut state = restored(root, captured);
    let unauthenticated = Apply {
        file_id: "2026-10-14-1-2-4".into(),
        checkout_error: Some(super::CheckoutError { message: "failure".into() }),
        ..normal
    };
    assert!(apply(&unauthenticated, &mut state).is_err());
    assert_eq!(fs::read(&source).unwrap(), b"after");
}
