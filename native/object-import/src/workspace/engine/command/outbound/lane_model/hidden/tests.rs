use super::{merge, model};
use serde_json::json;
use sha1::{Digest, Sha1};
use std::path::Path;

fn row(name: &str, hash: &str) -> String {
    format!("example.scope/{name}@{hash}")
}
fn history(id: &str, old: &str, new: &str) -> model::HistoryBytes {
    let hash = crate::validate::hexadecimal(&Sha1::digest(format!("{id}:VersionHistory")));
    let value = json!({"versions":[{"hash":new,"parents":[old]},{"hash":old,"parents":[]}]});
    model::HistoryBytes {
        bytes: model::encode(&hash, "VersionHistory", &value).unwrap(),
        hash,
        hashes: vec![old.into(), new.into()],
    }
}
#[test]
fn reconciles_advanced_diverged_missing_and_promoted_entries() {
    let old = "a".repeat(40);
    let new = "b".repeat(40);
    let other = "c".repeat(40);
    let remote = vec![
        row("advanced", &old),
        row("diverged", &new),
        row("remote-only", &other),
        row("visible", &old),
    ];
    let local = vec![row("advanced", &new), row("diverged", &old), row("removed", &new)];
    let lane = json!({"components":[{"id":{"scope":"example.scope","name":"visible"}}]});
    let histories = vec![
        history("example.scope/advanced", &old, &new),
        history("example.scope/diverged", &old, &new),
    ];
    assert_eq!(
        merge(&lane, &local, &remote, &histories, Path::new("/nonexistent")).unwrap(),
        vec![row("advanced", &new), row("diverged", &new), row("remote-only", &other)],
    );
    let mut override_lane = lane;
    override_lane["overrideUpdateDependents"] = json!(true);
    let mut expected =
        merge(&override_lane, &local, &remote, &histories, Path::new("/nonexistent")).unwrap();
    assert_eq!(expected.pop().unwrap(), row("removed", &new));
    assert_eq!(expected.len(), 3);
}
#[test]
fn equal_heads_and_missing_history_keep_remote() {
    let old = "a".repeat(40);
    let new = "b".repeat(40);
    let remote = vec![row("equal", &old), row("unknown", &old)];
    let local = vec![row("equal", &old), row("unknown", &new)];
    assert_eq!(
        merge(&json!({"components":[]}), &local, &remote, &[], Path::new("/nonexistent")).unwrap(),
        remote,
    );
}
