use super::{Object, Overlay, Target, history, object_hash, prepare, prepare_cached, publish};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture {
    root: PathBuf,
    remote: PathBuf,
    global: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir()
            .join(format!(
                "bit-command-import-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        let root = base.join("workspace");
        let remote = base.join("remote");
        let global = base.join("global-remotes.json");
        fs::create_dir_all(root.join(".bit/objects")).unwrap();
        fs::create_dir_all(remote.join("objects")).unwrap();
        fs::write(root.join(".bit/scope.json"),serde_json::to_vec(&json!({"name":"local.scope","remotes":{"remote.scope":format!("file://{}",remote.display())}})).unwrap()).unwrap();
        fs::write(root.join(".bit/index.json"), b"{\"components\":[],\"lanes\":[]}").unwrap();
        fs::write(remote.join("scope.json"), b"{\"name\":\"remote.scope\",\"remotes\":{}}")
            .unwrap();
        Self { root, remote, global }
    }
    fn write(directory: &Path, hash: &str, kind: &str, value: Value) {
        let object = publish::object(hash, kind, value).unwrap();
        let store = crate::store::Store::new(directory.to_owned(), None).unwrap();
        store.write(hash, &object.bytes).unwrap();
    }
    fn model(&self, head: &str) {
        Self::write(
            &self.remote.join("objects"),
            &object_hash("remote.scope/alpha"),
            "Component",
            json!({"name":"alpha","scope":"remote.scope","versions":{"1.0.0":head},"lang":"javascript","deprecated":false,"bindingPrefix":"@remote","remotes":[],"schema":"1.0.0","head":head}),
        );
        Self::write(
            &self.remote.join("objects"),
            head,
            "Version",
            json!({"mainFile":"index.js","files":[],"log":{"date":"1","message":"tag"},"parents":[],"flattenedDependencies":[],"buildStatus":"pending"}),
        );
    }
    fn target() -> Target {
        Target { scope: Some("remote.scope".into()), name: "alpha".into(), version: "1.0.0".into() }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(self.root.parent().unwrap()).unwrap();
    }
}
#[test]
fn file_refresh_is_staged_and_validated_before_publication() {
    let fixture = Fixture::new();
    let head = "a".repeat(40);
    fixture.model(&head);
    let plan = prepare(&fixture.root, &fixture.global, &[Fixture::target()]).unwrap();
    assert!(
        plan.overlay
            .read(&head, "Version")
            .unwrap()
            .is_some(),
    );
    let history = history::identity("remote.scope/alpha");
    assert!(
        !fixture.remote
            .join("objects")
            .join(&history[..2])
            .join(&history[2..])
            .exists(),
    );
    assert!(!fixture.global.exists());
    fs::write(fixture.root.join(".bit/scope.json"), b"changed").unwrap();
    assert!(plan.commit().is_err());
    assert!(!fixture.global.exists());
    assert!(
        !fixture.remote
            .join("objects")
            .join(&history[..2])
            .join(&history[2..])
            .exists(),
    );
}
#[test]
fn commits_remote_history_and_local_mutable_objects_then_refs() {
    let fixture = Fixture::new();
    let head = "b".repeat(40);
    fixture.model(&head);
    let plan = prepare(&fixture.root, &fixture.global, &[Fixture::target()]).unwrap();
    plan.commit().unwrap();
    let history = history::identity("remote.scope/alpha");
    for directory in [fixture.remote.join("objects"), fixture.root.join(".bit/objects")] {
        assert!(
            directory
                .join(&history[..2])
                .join(&history[2..])
                .exists(),
        );
    }
    let refs: Value = serde_json::from_slice(
        &fs::read(fixture.root.join(".bit/refs/remotes/remote.scope/main")).unwrap(),
    )
    .unwrap();
    assert_eq!(refs[0]["head"], head);
    assert_eq!(fs::read(&fixture.global).unwrap(), b"{}");
}
#[test]
fn unexported_bitmap_requires_no_remote_resolution_or_global_config_creation() {
    let fixture = Fixture::new();
    let plan = prepare(
        &fixture.root,
        &fixture.global,
        &[Target { scope: None, name: "new".into(), version: String::new() }],
    )
    .unwrap();
    plan.commit().unwrap();
    assert!(!fixture.global.exists());
    assert!(plan.overlay.models().is_empty());
}
#[test]
fn equal_remote_head_still_copies_scope_meta_without_populating_remote_history() {
    let fixture = Fixture::new();
    let head = "c".repeat(40);
    fixture.model(&head);
    let plan = prepare(&fixture.root, &fixture.global, &[Fixture::target()]).unwrap();
    plan.commit().unwrap();
    let history = history::identity("remote.scope/alpha");
    let remote_history = fixture.remote
        .join("objects")
        .join(&history[..2])
        .join(&history[2..]);
    fs::remove_file(&remote_history).unwrap();
    let plan = prepare(&fixture.root, &fixture.global, &[Fixture::target()]).unwrap();
    assert!(plan.writes.remote_objects.is_empty());
    assert_eq!(plan.progress[0].components.len(), 0);
    assert_eq!(plan.progress[0].objects.len(), 1);
    assert_eq!(plan.progress[1].components.len(), 0, "onlyIfBuilt skips remotely pending versions");
    assert_eq!(plan.progress[1].objects.len(), 1);
    plan.commit().unwrap();
    assert!(!remote_history.exists());
}
#[test]
fn external_scope_without_mapping_declines_before_any_publication() {
    let fixture = Fixture::new();
    let target = Target {
        scope: Some("unmapped.scope".into()),
        name: "alpha".into(),
        version: "1.0.0".into(),
    };
    assert!(prepare(&fixture.root, &fixture.global, &[target]).is_err());
    assert!(!fixture.global.exists());
    assert_eq!(fs::read_dir(fixture.root.join(".bit/objects")).unwrap().count(), 0);
}

#[test]
fn main_merge_gap_keeps_selection_cached_then_records_fetched_origin_head() {
    let fixture = Fixture::new();
    let head = "d".repeat(40);
    fixture.model(&head);
    let refs = fixture.root.join(".bit/refs/remotes/remote.scope/main");
    fs::create_dir_all(refs.parent().unwrap()).unwrap();
    let old = serde_json::to_vec(
        &json!([{"id":{"scope":"remote.scope","name":"alpha"},"head":"e".repeat(40)}]),
    )
    .unwrap();
    fs::write(&refs, &old).unwrap();
    let mut plan = prepare_cached(&fixture.root, &fixture.global).unwrap();
    assert!(plan.overlay.models().is_empty());
    assert!(plan.progress.is_empty());
    assert!(!fixture.global.exists());
    plan.prepare_merge_gap(&[Fixture::target()])
        .unwrap();
    assert_eq!(
        plan.progress[0].reason.as_deref(),
        Some("for getting the common-snap between main and main"),
    );
    assert_eq!(plan.progress[0].components.len(), 1);
    assert_eq!(plan.overlay.remote_refs["remote.scope"][0]["head"], head);
    assert!(plan.writes.remote_objects.is_empty());
    plan.commit().unwrap();
    let updated: Value = serde_json::from_slice(&fs::read(refs).unwrap()).unwrap();
    assert_eq!(updated[0]["head"], head);
    let history = history::identity("remote.scope/alpha");
    assert!(
        !fixture.remote
            .join("objects")
            .join(&history[..2])
            .join(&history[2..])
            .exists(),
    );
}

#[test]
fn empty_cached_merge_owner_does_not_create_global_remotes() {
    let fixture = Fixture::new();
    let mut plan = prepare_cached(&fixture.root, &fixture.global).unwrap();
    plan.prepare_merge_gap(&[]).unwrap();
    plan.commit().unwrap();
    assert!(!fixture.global.exists());
}

#[test]
fn unexported_head_sync_is_noop_for_own_scope_and_fetches_explicit_file_origin() {
    let fixture = Fixture::new();
    let mut plan = prepare(&fixture.root, &fixture.global, &[]).unwrap();
    plan.sync_unexported(
        &fixture.global,
        &[Target {
            scope: Some("local.scope".into()),
            name: "alpha".into(),
            version: "latest".into(),
        }],
    )
    .unwrap();
    assert!(plan.progress.is_empty());
    assert!(plan.overlay.models().is_empty());
    plan.commit().unwrap();
    assert!(!fixture.global.exists());
    let head = "f".repeat(40);
    fixture.model(&head);
    plan.sync_unexported(&fixture.global, &[Fixture::target()])
        .unwrap();
    assert_eq!(
        plan.progress[0].reason.as_deref(),
        Some("for making sure the new components are really new and are not out-of-sync"),
    );
    assert_eq!(plan.overlay.remote_refs["remote.scope"][0]["head"], head);
    assert!(plan.writes.remote_objects.is_empty());
    assert!(!fixture.global.exists());
    plan.commit().unwrap();
    assert!(fixture.global.exists());
}

#[test]
fn cached_external_gap_initializes_remotes_even_without_object_fetch() {
    let fixture = Fixture::new();
    let head = "1".repeat(40);
    fixture.model(&head);
    prepare(&fixture.root, &fixture.global, &[Fixture::target()])
        .unwrap()
        .commit()
        .unwrap();
    fs::remove_file(&fixture.global).unwrap();
    Fixture::write(
        &fixture.root.join(".bit/objects"),
        &head,
        "Version",
        json!({"mainFile":"index.js","files":[],"log":{"date":"1","message":"tag"},"parents":[],"flattenedDependencies":[],"buildStatus":"succeed"}),
    );
    let mut plan = prepare_cached(&fixture.root, &fixture.global).unwrap();
    plan.prepare_merge_gap(&[Fixture::target()])
        .unwrap();
    assert!(plan.progress[0].ids.is_empty());
    assert!(plan.overlay.models().is_empty());
    assert!(!fixture.global.exists());
    plan.commit().unwrap();
    assert_eq!(fs::read(&fixture.global).unwrap(), b"{}");
}

pub(crate) fn test_overlay(objects: Vec<(String, String, Vec<u8>, Option<Value>)>) -> Overlay {
    let mut overlay = Overlay::default();
    for (hash, kind, bytes, value) in objects {
        let source = (kind == "Source").then(|| {
            use std::io::Read;
            let mut raw = Vec::new();
            flate2::read::ZlibDecoder::new(bytes.as_slice()).read_to_end(&mut raw).unwrap();
            raw.splitn(2, |byte| *byte == 0)
                .nth(1)
                .unwrap()
                .to_vec()
        });
        overlay.objects.insert(hash, Object { kind, bytes, value, source });
    }
    overlay
}
