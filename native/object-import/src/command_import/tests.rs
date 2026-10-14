use super::{
    Object, Overlay, PreparedImport, Target, history, object_hash, prepare, prepare_cached, publish,
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Write},
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
    fn index_action<Output>(&self, action: impl FnOnce() -> io::Result<Output>) -> Option<Output> {
        let before = tree(self.root.parent().unwrap());
        let result = action();
        if cfg!(target_os = "linux") {
            Some(result.unwrap())
        } else {
            assert!(
                result
                    .err()
                    .unwrap()
                    .to_string()
                    .contains("index ACL preservation"),
            );
            assert_eq!(
                tree(self.root.parent().unwrap()),
                before,
                "unsupported index publication must leave every remote/local file unchanged",
            );
            None
        }
    }
    fn imported(&self) -> Option<PreparedImport> {
        self.index_action(|| prepare(&self.root, &self.global, &[Self::target()]))
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
    let Some(plan) = fixture.imported() else {
        return;
    };
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
    let Some(plan) = fixture.imported() else {
        return;
    };
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
    let Some(plan) = fixture.imported() else {
        return;
    };
    plan.commit().unwrap();
    let history = history::identity("remote.scope/alpha");
    let remote_history = fixture.remote
        .join("objects")
        .join(&history[..2])
        .join(&history[2..]);
    fs::remove_file(&remote_history).unwrap();
    let Some(plan) = fixture.imported() else {
        return;
    };
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
    if fixture
        .index_action(|| plan.prepare_merge_gap(&[Fixture::target()]))
        .is_none()
    {
        assert!(plan.commit().is_err());
        return;
    }
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
    if fixture
        .index_action(|| plan.sync_unexported(&fixture.global, &[Fixture::target()]))
        .is_none()
    {
        assert!(plan.commit().is_err());
        return;
    }
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
    let Some(plan) = fixture.imported() else {
        return;
    };
    plan.commit().unwrap();
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
        let mut inflated_size = 0;
        let source = (kind == "Source").then(|| {
            use std::io::Read;
            let mut raw = Vec::new();
            flate2::read::ZlibDecoder::new(bytes.as_slice()).read_to_end(&mut raw).unwrap();
            inflated_size = raw.len();
            raw.splitn(2, |byte| *byte == 0)
                .nth(1)
                .unwrap()
                .to_vec()
        });
        overlay.objects.insert(hash, Object { kind, bytes, value, source, inflated_size });
    }
    overlay
}

fn tree(directory: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut output = BTreeMap::new();
    for entry in fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            output.extend(tree(&path));
        } else {
            output.insert(path.clone(), fs::read(path).unwrap());
        }
    }
    output
}

#[test]
fn cached_gap_without_index_changes_publishes_global_config_on_every_platform() {
    let fixture = Fixture::new();
    let head = "2".repeat(40);
    fixture.model(&head);
    let model_hash = object_hash("remote.scope/alpha");
    for hash in [&model_hash, &head] {
        let relative = Path::new(&hash[..2]).join(&hash[2..]);
        let destination = fixture.root.join(".bit/objects").join(&relative);
        fs::create_dir_all(destination.parent().unwrap()).unwrap();
        fs::copy(fixture.remote.join("objects").join(relative), destination).unwrap();
    }
    Fixture::write(
        &fixture.root.join(".bit/objects"),
        &head,
        "Version",
        json!({"mainFile":"index.js","files":[],"log":{"date":"1","message":"tag"},
            "parents":[],"flattenedDependencies":[],"buildStatus":"succeed"}),
    );
    let before = tree(fixture.root.parent().unwrap());
    let mut plan = prepare_cached(&fixture.root, &fixture.global).unwrap();
    plan.prepare_merge_gap(&[Fixture::target()])
        .unwrap();
    assert!(!plan.writes.index_changed);
    assert!(plan.overlay.objects.is_empty());
    assert_eq!(tree(fixture.root.parent().unwrap()), before);
    plan.commit().unwrap();
    let mut expected = before;
    expected.insert(fixture.global.clone(), b"{}".to_vec());
    assert_eq!(tree(fixture.root.parent().unwrap()), expected);
}

#[test]
fn unsupported_index_metadata_declines_before_remote_or_local_publication() {
    let fixture = Fixture::new();
    fixture.model(&"3".repeat(40));
    fs::hard_link(fixture.root.join(".bit/index.json"), fixture.root.join("index-alias")).unwrap();
    let before = tree(fixture.root.parent().unwrap());
    assert!(prepare(&fixture.root, &fixture.global, &[Fixture::target()]).is_err());
    assert_eq!(tree(fixture.root.parent().unwrap()), before);
}

#[test]
fn repeated_fetch_counts_cached_sources_and_preserves_existing_ref_inode() {
    let fixture = Fixture::new();
    let head = "4".repeat(40);
    fixture.model(&head);
    let source = "module.exports = 1;\n";
    let source_hash = object_hash(source);
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    write!(encoder, "Source {source_hash} {}\0{source}", source.len()).unwrap();
    crate::store::Store::new(fixture.remote.join("objects"), None)
        .unwrap()
        .write(&source_hash, &encoder.finish().unwrap())
        .unwrap();
    Fixture::write(
        &fixture.remote.join("objects"),
        &head,
        "Version",
        json!({"mainFile":"index.js","files":[
            {"relativePath":"index.js","name":"index.js","test":false,"file":source_hash},
            {"relativePath":"copy.js","name":"copy.js","test":false,"file":source_hash}],
            "log":{"date":"1","message":"tag"},"parents":[],"flattenedDependencies":[],"buildStatus":"pending"}),
    );
    fs::write(fixture.root.join(".bit/index.json"), serde_json::to_vec(&json!({"components":[
        {"id":{"scope":"remote.scope","name":"alpha"},"hash":object_hash("remote.scope/alpha"),"isSymlink":false}],"lanes":[]})).unwrap()).unwrap();
    let refs = fixture.root.join(".bit/refs/remotes/remote.scope/main");
    fs::create_dir_all(refs.parent().unwrap()).unwrap();
    fs::write(&refs, b"[]").unwrap();
    let alias = fixture.root.join("refs-alias");
    fs::hard_link(&refs, &alias).unwrap();
    let before = tree(fixture.root.parent().unwrap());
    let mut plan = prepare_cached(&fixture.root, &fixture.global).unwrap();
    plan.prepare_versions(&[Fixture::target()])
        .unwrap();
    plan.prepare_versions(&[Fixture::target()])
        .unwrap();
    for row in &plan.progress {
        assert!(row.objects.contains(&source_hash));
        assert_eq!(
            row.objects.len(),
            3,
            "Source duplicates count once alongside Version and ScopeMeta",
        );
    }
    assert_eq!(plan.progress.len(), 2);
    assert!(!plan.writes.index_changed);
    assert_eq!(tree(fixture.root.parent().unwrap()), before);
    plan.commit().unwrap();
    let bytes = fs::read(&refs).unwrap();
    assert_eq!(
        fs::read(alias).unwrap(),
        bytes,
        "canonical outputFile preserves existing hard links",
    );
    assert_eq!(serde_json::from_slice::<Value>(&bytes).unwrap()[0]["head"], head);
}

#[test]
fn lane_referenced_import_fetches_only_missing_same_scope_snap_sources() {
    let fixture = Fixture::new();
    let snap = "8".repeat(40);
    let existing = "9".repeat(40);
    let source = "referenced source";
    let source_hash = object_hash(source);
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    write!(encoder, "Source {source_hash} {}\0{source}", source.len()).unwrap();
    crate::store::Store::new(fixture.remote.join("objects"), None)
        .unwrap()
        .write(&source_hash, &encoder.finish().unwrap())
        .unwrap();
    let version = json!({"files":[{"file":source_hash}],"flattenedEdgesRef":source_hash,
        "parents":["7".repeat(40)],"extensions":[{"name":"teambit.pipelines/builder","data":{"artifacts":[{"files":[{"file":"6".repeat(40)}]}]}}]});
    Fixture::write(&fixture.remote.join("objects"), &snap, "Version", version);
    Fixture::write(
        &fixture.root.join(".bit/objects"),
        &existing,
        "Version",
        json!({"files":[{"file":"5".repeat(40)}]}),
    );
    let before = tree(fixture.root.parent().unwrap());
    let mut imported = super::prepare_lane(&fixture.root, &fixture.global).unwrap();
    let heads = [(
        "remote.scope/alpha".into(),
        json!({"flattenedDependencies":[
        {"scope":"remote.scope","name":"dep","version":snap},
        {"scope":"remote.scope","name":"duplicate","version":snap},
        {"scope":"remote.scope","name":"existing","version":existing},
        {"scope":"remote.scope","name":"tagged","version":"1.0.0"},
        {"scope":"other.scope","name":"foreign","version":"4".repeat(40)}]}),
    )];
    imported.prepare_lane_referenced("remote.scope", &heads).unwrap();
    assert_eq!(imported.progress.len(), 2);
    assert_eq!(imported.progress[0].ids, vec![snap.clone()]);
    assert_eq!(imported.progress[1].ids, vec![source_hash.clone()]);
    assert!(
        imported.progress
            .iter()
            .all(|row| row.object_request && row.reason.is_none()),
    );
    assert!(
        imported.overlay
            .read(&snap, "Version")
            .unwrap()
            .is_some(),
    );
    assert_eq!(imported.overlay.source(&source_hash), Some(source.as_bytes()));
    assert_eq!(tree(fixture.root.parent().unwrap()), before);
    imported.prepare_lane_referenced("remote.scope", &heads).unwrap();
    assert_eq!(imported.progress.len(), 2);
}

#[test]
fn lane_main_refresh_counts_headless_requested_components_separately_from_imports() {
    let fixture = Fixture::new();
    fixture.model(&"a".repeat(40));
    Fixture::write(
        &fixture.remote.join("objects"),
        &object_hash("remote.scope/new"),
        "Component",
        json!({"name":"new","scope":"remote.scope","versions":{},"lang":"javascript","deprecated":false,"bindingPrefix":"@remote","remotes":[],"schema":"1.0.0"}),
    );
    let mut plan = prepare_cached(&fixture.root, &fixture.global).unwrap();
    if fixture
        .index_action(|| {
            plan.refresh_lane_main(&["remote.scope/alpha".into(), "remote.scope/new".into()])
        })
        .is_none()
    {
        return;
    }
    let progress = plan.progress.last().unwrap();
    assert_eq!(progress.ids, vec!["remote.scope/alpha@latest", "remote.scope/new@latest"]);
    assert_eq!(progress.components.len(), 1);
    assert!(
        !fixture.root
            .join(".bit/objects")
            .join(&object_hash("remote.scope/alpha")[..2])
            .exists(),
    );
}

#[test]
fn local_new_lane_common_snap_fetches_from_component_home_scope() {
    let fixture = Fixture::new();
    let head = "a".repeat(40);
    fixture.model(&head);
    let mut plan = prepare_cached(&fixture.root, &fixture.global).unwrap();
    let current = super::lane::Id { scope: "local.scope".into(), name: "main".into() };
    let other = super::lane::Id { scope: "local.scope".into(), name: "new-lane".into() };
    let lane = super::lane::Record {
        hash: "b".repeat(40),
        value: json!({"components":[{"id":{"scope":"remote.scope","name":"alpha"},"head":head}],"updateDependents":[]}),
        is_new: true,
    };
    plan.lane_gap_source(&current, &other, Some(&lane), true)
        .unwrap();
    if fixture
        .index_action(|| plan.prepare_merge_gap(&[Fixture::target()]))
        .is_none()
    {
        return;
    }
    let progress = plan.progress.last().unwrap();
    assert_eq!(progress.ids, vec!["remote.scope/alpha@1.0.0"]);
    assert_eq!(progress.components.len(), 1);
    assert_eq!(
        progress.reason.as_deref(),
        Some("for getting the common-snap between main and local.scope/new-lane"),
    );
    assert!(
        plan.overlay
            .read(&head, "Version")
            .unwrap()
            .is_some(),
    );
}
