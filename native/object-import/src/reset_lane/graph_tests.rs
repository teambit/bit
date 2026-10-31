use super::{Heads, Repository, diagnostics, object_path, outbound, selection};
use serde_json::{Value, json};
use std::{
    fs,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
const BASE: &str = "1111111111111111111111111111111111111111";
const MAIN: &str = "2222222222222222222222222222222222222222";
const MERGE: &str = "3333333333333333333333333333333333333333";

struct Fixture(std::path::PathBuf);
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("remove fixture");
    }
}

fn object(objects: &Path, hash: &str, value: &Value) {
    let path = object_path(objects, hash);
    fs::create_dir_all(path.parent().expect("parent")).expect("directory");
    fs::write(path, outbound::encode_object(hash, "Version", value).expect("encode"))
        .expect("object");
}

fn merged() -> (Fixture, Repository) {
    let root = std::env::temp_dir()
        .join(format!(
            "bit-reset-graph-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    let objects = root.join("objects");
    object(&objects, BASE, &json!({"parents":[]}));
    object(&objects, MAIN, &json!({"parents":[BASE]}));
    object(
        &objects,
        MERGE,
        &json!({"parents":[BASE,MAIN],"origin":{"lane":{"scope":"scope","name":"work"}}}),
    );
    let repository = Repository {
        reads: Vec::new(),
        objects,
        lane_scope: "scope".into(),
        lane_name: "work".into(),
        lane_hash: "4444444444444444444444444444444444444444".into(),
        lane: json!({"scope":"scope","name":"work","components":[]}),
        heads: Heads {
            current: MERGE.into(),
            remote: Some(BASE.into()),
            baseline: Some(BASE.into()),
        },
        model: json!({"scope":"scope","name":"comp","versions":{"0.0.1":BASE},"head":MAIN}),
    };
    (Fixture(root), repository)
}

#[test]
fn merge_reset_uses_common_lane_baseline_and_preserves_merged_main_tag() {
    let (_fixture, repository) = merged();
    let plan = selection::select(&repository, false).expect("all reset");
    assert_eq!(plan.removed, [MERGE]);
    assert_eq!(plan.next.as_deref(), Some(BASE));
    assert!(plan.keep_lane);
}

#[test]
fn head_only_merge_reset_reports_published_multiple_parent_failure() {
    let (_fixture, repository) = merged();
    let error = selection::select(&repository, true).err().expect("head error");
    assert_eq!(diagnostics::diagnostic(&error),Some(format!("removeComponentVersions found multiple parents for a local (un-exported) version {MERGE} of scope/comp").as_str()));
}

#[test]
fn corruption_does_not_become_an_owned_canonical_reset_error() {
    let (_fixture, repository) = merged();
    fs::write(object_path(&repository.objects, MERGE), b"broken compressed Version")
        .expect("corrupt");
    let error = selection::select(&repository, false).err().expect("corrupt fails");
    assert_eq!(diagnostics::diagnostic(&error), None);
}

#[test]
fn only_all_reset_removes_a_lane_member_at_its_unexported_common_boundary() {
    let (_fixture, mut repository) = merged();
    object(&repository.objects, MERGE, &json!({"parents":[BASE]}));
    repository.heads.remote = None;
    let all = selection::select(&repository, false).expect("all reset");
    let head = selection::select(&repository, true).expect("head reset");
    assert_eq!(all.next, head.next);
    assert_eq!(head.next.as_deref(), Some(BASE));
    assert!(!all.keep_lane);
    assert!(head.keep_lane);
}

#[test]
fn cold_target_population_survives_a_later_canonical_error() {
    let (_fixture, mut repository) = merged();
    let remote = "5555555555555555555555555555555555555555";
    object(&repository.objects, remote, &json!({"parents":[BASE]}));
    repository.heads.baseline = Some(remote.into());
    let changes = super::history::populations(&repository).expect("populate both graph heads");
    assert_eq!(changes.len(), 2);
    let history_hash = super::object_hash("scope/comp:VersionHistory");
    let history_path = object_path(&repository.objects, &history_hash);
    assert!(!history_path.exists());
    let error = diagnostics::with_population(
        diagnostics::error("published later error"),
        &repository.objects,
        changes,
        super::proofs::capture(&repository).expect("retained graph"),
    );
    assert_eq!(diagnostics::diagnostic(&error), Some("published later error"));
    diagnostics::apply_error_prefix(&error).expect("publish exact prefix");
    let history = outbound::read_object(&repository.objects, &history_hash, "VersionHistory")
        .expect("history");
    let hashes = history["versions"]
        .as_array()
        .expect("rows")
        .iter()
        .map(|row| row["hash"].as_str().expect("hash"))
        .collect::<Vec<_>>();
    assert_eq!(hashes, [MERGE, BASE, MAIN, remote]);
}

#[test]
fn population_prefix_rejects_changed_history_before_any_write() {
    let (_fixture, repository) = merged();
    let changes = super::history::populations(&repository).expect("population");
    let retained = super::proofs::capture(&repository).expect("retained graph");
    let path = object_path(&repository.objects, &super::object_hash("scope/comp:VersionHistory"));
    fs::create_dir_all(path.parent().expect("parent")).expect("directory");
    fs::write(&path, b"concurrent history bytes").expect("concurrent write");
    let error = diagnostics::with_population(
        diagnostics::error("published later error"),
        &repository.objects,
        changes,
        retained,
    );
    assert!(diagnostics::apply_error_prefix(&error).is_err());
    assert_eq!(fs::read(path).expect("unchanged"), b"concurrent history bytes");
}

#[test]
fn hidden_scoped_unknown_boundary_keeps_the_published_new_lane_error() {
    let (_fixture, mut repository) = merged();
    object(&repository.objects, MERGE, &json!({"parents":[]}));
    repository.heads.remote = None;
    repository.heads.baseline = None;
    repository.model = json!({"scope":"scope","name":"comp","versions":{}});
    let selected = selection::select(&repository, false).expect("local hidden snap");
    let mut bitmap = super::BitmapState {
        before: Vec::new(),
        document: json!({}),
        key: String::new(),
        lane_scope: "scope".into(),
        lane_name: "work".into(),
        exported: false,
        staged_config: None,
        restored: false,
    };
    assert!(bitmap.component_is_exported(&repository.model));
    let error = selection::validate_replacement(
        &repository,
        &selected,
        !bitmap.exported && bitmap.component_is_exported(&repository.model),
    )
    .expect_err("hidden scoped component cannot lose its last version");
    assert!(
        diagnostics::diagnostic(&error)
            .expect("canonical error")
            .starts_with(r#"fatal: unable to find a new head for "scope/comp"."#),
    );
    bitmap.key = "comp".into();
    bitmap.document = json!({"comp":{"scope":"","defaultScope":"scope"}});
    assert!(!bitmap.component_is_exported(&repository.model));
    selection::validate_replacement(
        &repository,
        &selected,
        !bitmap.exported && bitmap.component_is_exported(&repository.model),
    )
    .expect("visible unexported component may return to new");
}
