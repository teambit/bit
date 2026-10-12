use super::{State, apply, plan};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-checkout-transition-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&path).expect("fixture directory");
        Self(path)
    }
    fn state(&self) -> (State, Value) {
        let mut state = State::default();
        let plan = plan::Plan {
            bodies: vec![plan::Body::new(b"new\n".to_vec())],
            target: vec![],
            target_indices: vec![],
            current: vec![],
            merge_rows: vec![],
            has_conflicts: false,
            statuses: vec![],
        };
        let output = state.plans
            .retain(plan, &json!({}), &self.0)
            .expect("retain");
        (state, output["token"].clone())
    }
    fn store(&self, hash: &str, kind: &str, body: &[u8]) {
        let mut compressed = ZlibEncoder::new(Vec::new(), Compression::default());
        write!(compressed, "{kind} {hash} {}\0", body.len()).expect("header");
        compressed.write_all(body).expect("body");
        let directory = self.0.join("objects").join(&hash[..2]);
        fs::create_dir_all(&directory).expect("object directory");
        fs::write(directory.join(&hash[2..]), compressed.finish().expect("compress"))
            .expect("object");
    }
    fn prepare(&self, bytes: &[u8]) -> Value {
        let hash = crate::validate::hexadecimal(&sha1::Sha1::digest(bytes));
        self.store(&hash, "Source", bytes);
        let version = "2".repeat(40);
        let files = json!([{"file":hash,"relativePath":"index.ts","name":"index.ts","test":false}]);
        self.store(
            &version,
            "Version",
            serde_json::to_vec(&json!({"files":files})).expect("version").as_slice(),
        );
        let snapshots = self.0.join("snapshots");
        fs::create_dir(&snapshots).expect("snapshots");
        json!({"objectsDirectory":self.0.join("objects"),"snapshotDirectory":snapshots,"target":{"hash":version,"files":[{"hash":hash,"relativePath":"index.ts","name":"index.ts","test":false}]},"current":[]})
    }
}
use sha1::Digest;

#[test]
fn prepare_retains_verified_source_and_random_version_identity() {
    let fixture = Fixture::new();
    let request = fixture.prepare(b"hello\n");
    let mut state = State::default();
    let output = apply("checkoutPrepare", request, &mut state).expect("prepare");
    assert_eq!(output["targetFiles"][0]["planIndex"], 0);
    assert_eq!(output["statuses"], json!([{"relativePath":"index.ts","status":"updated"}]));
    let spool = output["targetFiles"][0]["spoolPath"].as_str().expect("spool");
    assert_eq!(fs::read(spool).expect("spool bytes"), b"hello\n");
    assert!(output["targetFiles"][0].get("contents").is_none());
}
#[test]
fn stale_current_snapshot_declines_before_any_private_write() {
    let fixture = Fixture::new();
    let mut request = fixture.prepare(b"target");
    let path = fixture.0.join("current");
    fs::write(&path, b"changed").expect("current");
    request["current"] = json!([{"relativePath":"index.ts","path":path,"rawHash":"3".repeat(40),"snapshotHash":"3".repeat(40),"protected":false}]);
    assert!(apply("checkoutPrepare", request.clone(), &mut State::default()).is_err());
    assert!(
        fs::read_dir(request["snapshotDirectory"].as_str().expect("directory"))
            .expect("read private")
            .next()
            .is_none(),
    );
}
#[test]
fn late_missing_source_declines_whole_prepare_without_spools() {
    let fixture = Fixture::new();
    let mut request = fixture.prepare(b"target");
    let missing =
        json!({"hash":"4".repeat(40),"relativePath":"missing.ts","name":"missing.ts","test":false});
    request["target"]["files"]
        .as_array_mut()
        .expect("files")
        .push(missing);
    let manifest=request["target"]["files"].as_array().expect("files").iter().map(|file|json!({"file":file["hash"],"relativePath":file["relativePath"],"name":file["name"],"test":file["test"]})).collect::<Vec<_>>();
    fixture.store(
        &"2".repeat(40),
        "Version",
        &serde_json::to_vec(&json!({"files":manifest})).expect("manifest"),
    );
    assert!(apply("checkoutPrepare", request.clone(), &mut State::default()).is_err());
    assert!(
        fs::read_dir(request["snapshotDirectory"].as_str().expect("directory"))
            .expect("private directory")
            .next()
            .is_none(),
    );
}
#[test]
fn verified_workspace_bom_and_crlf_have_distinct_raw_and_linux_statuses() {
    let fixture = Fixture::new();
    let mut request = fixture.prepare(b"same\n");
    let path = fixture.0.join("current");
    fs::write(&path, b"\xef\xbb\xbfsame\r\n").expect("current");
    request["current"] = json!([{"relativePath":"index.ts","path":path,"rawHash":hash(b"\xef\xbb\xbfsame\r\n"),"snapshotHash":hash(b"same\r\n"),"protected":false}]);
    let output = apply("checkoutPrepare", request, &mut State::default()).expect("prepare");
    assert_eq!(output["statuses"][0]["status"], "updated");
    assert_eq!(output["currentFiles"][0]["currentHash"], hash(b"same\n"));
    assert_eq!(output["currentFiles"][0]["sharesCurrent"], false);
    let body = output["currentFiles"][0]["spoolPath"].as_str().expect("spool");
    assert_eq!(fs::read(body).expect("LF snapshot"), b"same\n");
}
#[test]
fn workspace_root_bitmap_matches_guarded_post_callback_snapshot() {
    let fixture = Fixture::new();
    let original=br#"{"$schema-version":"17","entry":{"scope":"scope","name":"entry","version":"1.0.0","rootDir":"entry"},"_bit_lane":{"name":"lane","scope":"scope"}}"#;
    let normalized = crate::inspection::normalize_bitmap(original).expect("canonical bitmap");
    let mut request = fixture.prepare(&normalized);
    let path = fixture.0.join(".bitmap");
    fs::write(&path, original).expect("disk bitmap");
    request["current"] = json!([{"relativePath":".bitmap","path":path,"rawHash":hash(original),"snapshotHash":hash(&normalized),"protected":true,"bitmap":true}]);
    let output = apply("checkoutPrepare", request, &mut State::default()).expect("prepare");
    assert_eq!(output["currentFiles"][0]["currentHash"], hash(&normalized));
    assert_eq!(output["currentFiles"][0]["sharesCurrent"], true);
    let spool = output["currentFiles"][0]["spoolPath"].as_str().expect("spool");
    assert_eq!(fs::read(spool).expect("normalized bitmap"), normalized);
}
fn hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&sha1::Sha1::digest(bytes))
}

#[test]
fn merge_conflict_is_retained_and_materialized_without_body_response() {
    let fixture = Fixture::new();
    let mut request = fixture.prepare(b"remote\n");
    let base_hash = hash(b"base\n");
    fixture.store(&base_hash, "Source", b"base\n");
    let base_version = "3".repeat(40);
    fixture.store(&base_version,"Version",&serde_json::to_vec(&json!({"files":[{"file":base_hash,"relativePath":"index.ts","name":"index.ts","test":false}]})).expect("base"));
    let current = fixture.0.join("current");
    fs::write(&current, b"local\n").expect("current");
    request["current"] = json!([{"relativePath":"index.ts","path":current,"rawHash":hash(b"local\n"),"snapshotHash":hash(b"local\n"),"protected":false}]);
    request["base"] = json!({"hash":base_version,"files":[{"hash":base_hash,"relativePath":"index.ts","name":"index.ts","test":false}]});
    request["labels"] = json!({"current":"local","other":"remote"});
    let mut state = State::default();
    let prepared = apply("checkoutPrepare", request, &mut state).expect("merge prepare");
    assert_eq!(prepared["hasConflicts"], true);
    assert!(prepared["mergeRows"][0].get("conflict").is_none());
    assert_eq!(prepared["currentFiles"][0]["sharesCurrent"], true);
    let applied=apply("checkoutApply",json!({"token":prepared["token"],"strategy":"manual","forceOurs":false,"currentExists":true,"tracked":true,"workspaceRoot":false}),&mut state).expect("apply");
    assert_eq!(applied["filesStatus"][0]["status"], "manual");
    let output = fixture.0.join("result");
    let write=apply("checkoutMaterialize",json!({"token":prepared["token"],"files":[destination(&output,applied["files"][0]["planIndex"].as_u64().expect("index") as usize)]}),&mut state).expect("write");
    assert_eq!(write["failed"], false);
    assert!(
        String::from_utf8(fs::read(output).expect("merged"))
            .expect("UTF8")
            .contains("<<<<<<< local"),
    );
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn destination(path: &std::path::Path, index: usize) -> Value {
    json!({"planIndex":index,"path":path,"overwrite":true,"eol":"auto"})
}
#[test]
fn invalid_late_destination_cannot_mutate_valid_prefix() {
    let fixture = Fixture::new();
    let (mut state, token) = fixture.state();
    let path = fixture.0.join("valid");
    fs::write(&path, b"old").expect("old contents");
    let result = apply(
        "checkoutMaterialize",
        json!({"token":token,"files":[destination(&path,0),destination(&fixture.0.join("invalid"),1)]}),
        &mut state,
    );
    assert!(result.is_err());
    assert_eq!(fs::read(path).expect("prefix unchanged"), b"old");
}
#[test]
fn filesystem_failure_acknowledges_only_completed_prefix() {
    let fixture = Fixture::new();
    let (mut state, token) = fixture.state();
    let first = fixture.0.join("first");
    let barrier = fixture.0.join("barrier");
    let last = fixture.0.join("last");
    fs::write(&barrier, b"not a directory").expect("barrier");
    let result=apply("checkoutMaterialize",json!({"token":token,"files":[destination(&first,0),destination(&barrier.join("child"),0),destination(&last,0)]}),&mut state).expect("prefix acknowledgment");
    assert_eq!(result, json!({"completed":1,"skipped":[],"failed":true}));
    assert_eq!(
        fs::read(first).expect("first written"),
        crate::checkout::eol::auto(b"new\n".to_vec()),
    );
    assert!(!last.exists());
}
#[test]
fn finish_keeps_durable_capsule_and_rejects_stale_materialization() {
    let fixture = Fixture::new();
    let (mut state, token) = fixture.state();
    let spool = state.plans.plans[token.as_str().expect("token")].bodies[0].path.clone();
    apply("checkoutFinish", json!({"token":token}), &mut state).expect("finish");
    assert_eq!(fs::read(spool).expect("durable fallback capsule"), b"new\n");
    assert!(apply("checkoutMaterialize", json!({"token":token,"files":[]}), &mut state).is_err());
}
#[test]
fn skip_preserves_existing_contents_and_counts_as_completed() {
    let fixture = Fixture::new();
    let (mut state, token) = fixture.state();
    let path = fixture.0.join("exists");
    fs::write(&path, b"old").expect("old contents");
    let mut file = destination(&path, 0);
    file["overwrite"] = json!(false);
    let result = apply("checkoutMaterialize", json!({"token":token,"files":[file]}), &mut state)
        .expect("skip");
    assert_eq!(result, json!({"completed":1,"skipped":[0],"failed":false}));
    assert_eq!(fs::read(path).expect("unchanged"), b"old");
}
fn current(path: PathBuf, relative: &str) -> plan::Current {
    plan::Current {
        relative_path: relative.into(),
        path,
        protected: true,
        plan_index: 0,
        shares_buffer: true,
    }
}
#[test]
fn removal_policy_observes_fresh_tracking_and_workspace_root_flags() {
    let fixture = Fixture::new();
    let (mut state, token) = fixture.state();
    state.plans.plans
        .get_mut(token.as_str().expect("token"))
        .expect("plan")
        .current = vec![
        current(fixture.0.join(".bitmap"), ".bitmap"),
        current(fixture.0.join("ordinary"), "ordinary"),
    ];
    let untracked = apply(
        "checkoutRemovals",
        json!({"token":token,"tracked":false,"workspaceRoot":true}),
        &mut state,
    )
    .expect("untracked");
    assert_eq!(untracked["removals"], json!([]));
    let root = apply(
        "checkoutRemovals",
        json!({"token":token,"tracked":true,"workspaceRoot":true}),
        &mut state,
    )
    .expect("root");
    assert_eq!(root["statuses"], json!([{"relativePath":"ordinary","status":"removed"}]));
    let normal = apply(
        "checkoutRemovals",
        json!({"token":token,"tracked":true,"workspaceRoot":false}),
        &mut state,
    )
    .expect("ordinary component");
    assert_eq!(
        normal["removals"]
            .as_array()
            .expect("removals")
            .len(),
        2,
    );
}
#[test]
fn deferred_apply_error_preserves_prior_modified_file_selector() {
    let fixture = Fixture::new();
    let (mut state, token) = fixture.state();
    let plan = state.plans.plans
        .get_mut(token.as_str().expect("token"))
        .expect("plan");
    plan.target = vec![
        serde_json::from_value(
            json!({"hash":"2".repeat(40),"relativePath":"a","name":"a","test":false}),
        )
        .expect("manifest"),
    ];
    plan.target_indices = vec![0];
    plan.bodies.push(plan::Body::new(b"merged".to_vec()));
    plan.current = vec![current(fixture.0.join("a"), "a"), current(fixture.0.join("b"), "b")];
    plan.merge_rows = vec![
        json!({"kind":"modifiedFiles","current":0,"outputPlanIndex":1}),
        json!({"kind":"modifiedFiles","current":1,"outputPlanIndex":1}),
    ];
    let result=apply("checkoutApply",json!({"token":token,"strategy":"manual","forceOurs":false,"currentExists":true,"tracked":false,"workspaceRoot":false}),&mut state).expect("deferred result");
    assert_eq!(result["files"][0]["planIndex"], 1);
    assert_eq!(result["filesStatus"], json!([{"relativePath":"a","status":"merged"}]));
    assert_eq!(result["deferredError"]["message"], "file b not found");
}
