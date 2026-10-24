use super::{State, apply};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(std::path::PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-snapshot-transaction-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn directory(&self, name: &str) -> std::path::PathBuf {
        let path = self.0.join(name);
        fs::create_dir(&path).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn source(body: &[u8]) -> Value {
    json!({"type":"Source","hash":crate::validate::hexadecimal(&Sha1::digest(body)),"body":crate::validate::hexadecimal(body)})
}
#[test]
fn invalid_late_object_preflights_before_any_spool_write() {
    let fixture = Fixture::new();
    let staging = fixture.directory("staging");
    let mut state = State::default();
    let mut invalid = source(b"wrong");
    invalid["hash"] = json!("a".repeat(40));
    let request = json!({"objects":[source(b"valid"),invalid],"stagingDirectory":staging});
    assert!(apply("snapshotSerialize", request, &mut state).is_err());
    assert_eq!(fs::read_dir(staging).unwrap().count(), 0);
    assert!(state.plans.is_empty());
}
#[test]
fn multiple_plans_preserve_frozen_bytes_and_commit_prefix() {
    let fixture = Fixture::new();
    let first = fixture.directory("first");
    let second = fixture.directory("second");
    let directory = fixture.directory("objects");
    let mut state = State::default();
    let first_plan = apply(
        "snapshotSerialize",
        json!({"objects":[source(b"alpha")],"stagingDirectory":first}),
        &mut state,
    )
    .unwrap();
    let second_plan = apply(
        "snapshotSerialize",
        json!({"objects":[source(b"beta")],"stagingDirectory":second}),
        &mut state,
    )
    .unwrap();
    assert_ne!(first_plan["token"], second_plan["token"]);
    for plan in [first_plan, second_plan] {
        let ack = apply(
            "snapshotCommit",
            json!({"token":plan["token"],"objectsDirectory":directory,"owner":null}),
            &mut state,
        )
        .unwrap();
        assert_eq!(ack["completed"], 1);
        assert_eq!(ack["failed"], false);
    }
}
#[test]
fn workspace_source_uses_raw_snapshot_and_canonical_bom_lf_conversion() {
    let fixture = Fixture::new();
    let staging = fixture.directory("stage");
    let path = fixture.0.join("source");
    let raw = b"\xef\xbb\xbfline\r\n";
    fs::write(&path, raw).unwrap();
    let hash = crate::validate::hexadecimal(&Sha1::digest(b"line\n"));
    let descriptor = json!({"type":"Source","hash":hash,"source":{"path":path,"hash":crate::validate::hexadecimal(&Sha1::digest(raw)),"sourceHash":hash}});
    let mut state = State::default();
    let output = apply(
        "snapshotSerialize",
        json!({"objects":[descriptor],"stagingDirectory":staging}),
        &mut state,
    )
    .unwrap();
    assert_eq!(output["objects"][0]["hash"], hash);
    assert_eq!(output["count"], 1);
}

#[test]
fn negative_zero_identity_has_canonical_json_and_false_truthiness() {
    let value = crate::js_json::Value::number(-0.0);
    assert!(!value.truthy().unwrap());
    assert_eq!(crate::js_json::stringify(&value, false).unwrap(), Some(b"0".to_vec()));
}

#[test]
fn commit_acknowledges_prefix_and_keeps_failed_suffix_private() {
    let fixture = Fixture::new();
    let staging = fixture.directory("staging");
    let directory = fixture.directory("objects");
    let mut state = State::default();
    let output=apply("snapshotSerialize",json!({"objects":[source(b"first"),source(b"second"),source(b"third")],"stagingDirectory":staging}),&mut state).unwrap();
    let blocked = output["objects"][1]["hash"].as_str().unwrap();
    let blocked_path = directory
        .join(&blocked[..2])
        .join(&blocked[2..]);
    fs::create_dir_all(&blocked_path).unwrap();
    let ack = apply(
        "snapshotCommit",
        json!({"token":output["token"],"objectsDirectory":directory,"owner":null}),
        &mut state,
    )
    .unwrap();
    assert_eq!(ack["completed"], 1);
    assert_eq!(ack["count"], 3);
    assert_eq!(ack["failed"], true);
    let untouched = output["objects"][2]["hash"].as_str().unwrap();
    assert!(
        !directory
            .join(&untouched[..2])
            .join(&untouched[2..])
            .exists(),
    );
    assert!(blocked_path.is_dir());
    assert_eq!(fs::read_dir(staging).unwrap().count(), 3);
}

#[test]
fn stale_workspace_descriptor_declines_before_any_private_object_write() {
    let fixture = Fixture::new();
    let staging = fixture.directory("staging");
    let path = fixture.0.join("source");
    fs::write(&path, b"changed").unwrap();
    let expected = crate::validate::hexadecimal(&Sha1::digest(b"original"));
    let request = json!({"objects":[{"type":"Source","hash":expected,"source":{"path":path,"hash":expected,"sourceHash":expected}}],"stagingDirectory":staging});
    assert!(apply("snapshotSerialize", request, &mut State::default()).is_err());
    assert_eq!(fs::read_dir(staging).unwrap().count(), 0);
}
