use super::{
    Batch, BitmapState, Plan, Repository, diagnostics, object_hash, object_path, outbound,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

const BASE: &str = "1111111111111111111111111111111111111111";
const ALPHA: &str = "2222222222222222222222222222222222222222";
const DETACHED: &str = "3333333333333333333333333333333333333333";
const OTHER: &str = "4444444444444444444444444444444444444444";
const MERGE: &str = "5555555555555555555555555555555555555555";

struct Fixture(tempfile::TempDir);
impl Fixture {
    fn new() -> Self {
        let value = Self(tempfile::tempdir().expect("fixture"));
        fs::create_dir_all(value.root().join(".bit/objects")).expect("objects");
        for (hash, parents) in [
            (BASE, vec![]),
            (ALPHA, vec![BASE]),
            (DETACHED, vec![BASE]),
            (OTHER, vec![BASE]),
            (MERGE, vec![BASE, OTHER]),
        ] {
            value.object(
                hash,
                "Version",
                &json!({"parents":parents,"origin":{"lane":{"scope":"scope","name":"work"}}}),
            );
        }
        value.object(&object_hash("scope/alpha"), "Component", &json!({"scope":"scope","name":"alpha","versions":{"1.0.0":BASE},"head":DETACHED,"detachedHeads":{"heads":[ALPHA]}}));
        value.object(
            &object_hash("scope/beta"),
            "Component",
            &json!({"scope":"scope","name":"beta","versions":{"1.0.0":BASE},"head":BASE}),
        );
        let lane = object_hash("scope/work");
        value.object(&lane, "Lane", &json!({"scope":"scope","name":"work","components":[{"id":{"scope":"scope","name":"alpha"},"head":ALPHA},{"id":{"scope":"scope","name":"beta"},"head":MERGE}]}));
        value.object(
            &object_hash(&format!("{lane}:LaneHistory")),
            "LaneHistory",
            &json!({"scope":"scope","name":"work","laneHash":lane,"history":{}}),
        );
        value.controls();
        value
    }
    fn root(&self) -> &Path {
        self.0.path()
    }
    fn object(&self, hash: &str, kind: &str, value: &Value) {
        let path = object_path(&self.root().join(".bit/objects"), hash);
        fs::create_dir_all(path.parent().expect("parent")).expect("directory");
        fs::write(path, outbound::encode_object(hash, kind, value).expect("encode"))
            .expect("object");
    }
    fn controls(&self) {
        let components = ["alpha", "beta"].map(|name| json!({"id":{"scope":"scope","name":name},"hash":object_hash(&format!("scope/{name}"))}));
        self.json(".bit/index.json", &json!({"components":components,"lanes":[{"id":{"scope":"scope","name":"work"},"hash":object_hash("scope/work")}]}));
        self.json(".bitmap", &json!({"alpha":{"scope":"scope","name":"alpha","version":ALPHA},"beta":{"scope":"scope","name":"beta","version":MERGE},"_bit_lane":{"id":{"scope":"scope","name":"work"},"exported":true}}));
        self.json(".bit/refs/remotes/scope/work", &json!([{"id":{"scope":"scope","name":"alpha"},"head":BASE},{"id":{"scope":"scope","name":"beta"},"head":BASE}]));
    }
    fn json(&self, path: &str, value: &Value) {
        let path = self.root().join(path);
        fs::create_dir_all(path.parent().expect("parent")).expect("directory");
        fs::write(path, serde_json::to_vec(value).expect("serialize")).expect("control");
    }
    fn history_path(&self, name: &str) -> PathBuf {
        object_path(
            &self.root().join(".bit/objects"),
            &object_hash(&format!("scope/{name}:VersionHistory")),
        )
    }
}

#[test]
fn staged_repository_load_does_not_require_a_visible_bitmap_row() {
    let fixture = Fixture::new();
    let mut bitmap: Value =
        serde_json::from_slice(&fs::read(fixture.root().join(".bitmap")).expect("bitmap"))
            .expect("JSON");
    bitmap
        .as_object_mut()
        .expect("rows")
        .shift_remove("alpha");
    fixture.json(".bitmap", &bitmap);
    let state = BitmapState {
        before: fs::read(fixture.root().join(".bitmap")).expect("bytes"),
        document: bitmap,
        key: String::new(),
        lane_scope: "scope".into(),
        lane_name: "work".into(),
        exported: true,
        staged_config: None,
        restored: false,
    };
    assert!(Repository::staged(fixture.root(), &state, "scope", "alpha").is_ok());
    assert!(Repository::load(fixture.root(), &state, "scope", "alpha").is_err());
}

#[test]
fn canonical_prefix_rejects_changed_mutable_inputs_before_any_history_write() {
    for control in [
        ".bitmap".to_owned(),
        ".bit/index.json".to_owned(),
        object_relative("scope/work"),
        object_relative("scope/alpha"),
        object_relative("scope/beta"),
        ".bit/refs/remotes/scope/work".to_owned(),
    ] {
        let fixture = Fixture::new();
        let error = Batch::prepare_selected(fixture.root(), &["scope/beta".into()], true, true)
            .err()
            .expect("merge error");
        assert!(diagnostics::diagnostic(&error).is_some());
        fs::write(fixture.root().join(control), b"concurrent mutable bytes").expect("mutation");
        assert!(diagnostics::apply_error_prefix(&error).is_err());
        assert!(!fixture.history_path("alpha").exists());
        assert!(!fixture.history_path("beta").exists());
    }
}

#[test]
fn canonical_prefix_retains_absent_remote_baseline_proofs() {
    let fixture = Fixture::new();
    fs::remove_file(fixture.root().join(".bit/refs/remotes/scope/work")).expect("remove refs");
    let error = Plan::prepare(fixture.root(), "scope/beta", true, true).err().expect("merge error");
    fixture.json(".bit/refs/remotes/scope/main", &json!([]));
    assert!(diagnostics::apply_error_prefix(&error).is_err());
    assert!(!fixture.history_path("beta").exists());
}

#[test]
fn later_selected_error_keeps_an_earlier_detached_main_population() {
    let fixture = Fixture::new();
    let bitmap = fs::read(fixture.root().join(".bitmap")).expect("bitmap");
    let model_path = fixture
        .root()
        .join(object_relative("scope/alpha"));
    let model = fs::read(&model_path).expect("model");
    let error = Batch::prepare_selected(
        fixture.root(),
        &["scope/alpha".into(), "scope/beta".into()],
        true,
        true,
    )
    .err()
    .expect("second merge fails");
    assert!(diagnostics::diagnostic(&error).expect("canonical").contains("multiple parents"));
    assert!(!fixture.history_path("alpha").exists());
    diagnostics::apply_error_prefix(&error).expect("retained populations");
    let history = outbound::read_object(
        &fixture.root().join(".bit/objects"),
        &object_hash("scope/alpha:VersionHistory"),
        "VersionHistory",
    )
    .expect("history");
    assert!(
        history["versions"]
            .as_array()
            .expect("rows")
            .iter()
            .any(|row| row["hash"] == DETACHED),
    );
    assert_eq!(fs::read(model_path).expect("unchanged model"), model);
    assert_eq!(fs::read(fixture.root().join(".bitmap")).expect("unchanged bitmap"), bitmap);
}

fn object_relative(identity: &str) -> String {
    let hash = object_hash(identity);
    format!(".bit/objects/{}/{}", &hash[..2], &hash[2..])
}
