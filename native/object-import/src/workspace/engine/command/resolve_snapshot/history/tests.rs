use super::tag_histories;
use crate::workspace::engine::{
    command::{
        repository::Repository,
        resolve_snapshot::{Material, Participation, VersionState},
    },
    status_history,
};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(std::path::PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-tag-history-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join(".bit/objects")).unwrap();
        Self(root)
    }
    fn root(&self) -> &Path {
        &self.0
    }
    fn object(&self, hash: &str, kind: &str, value: &Value) {
        let body = serde_json::to_string(value).unwrap();
        let serialized = format!("{kind} {hash} {}\0{body}", body.encode_utf16().count());
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(serialized.as_bytes()).unwrap();
        let file = self.0
            .join(".bit/objects")
            .join(&hash[..2])
            .join(&hash[2..]);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, encoder.finish().unwrap()).unwrap();
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn material(head: &str) -> Material {
    Material {
        identity: "scope/component".into(),
        model: json!({}),
        version: json!({}),
        files: Vec::new(),
        version_state: VersionState {
            current_head: head.into(),
            tagged_version: Some("2.0.0".into()),
        },
        pending: None,
        hidden: false,
        participation: Participation { selected: true, automatic: false },
    }
}

#[test]
fn tag_stages_only_preexisting_head_missing_from_existing_history() {
    let fixture = Fixture::new();
    let old = "a".repeat(40);
    let head = "b".repeat(40);
    let allocated_tag = "c".repeat(40);
    fixture.object(&head, "Version", &json!({"parents":[old]}));
    fixture.object(
        &status_history::identity("scope/component"),
        "VersionHistory",
        &json!({
            "name":"component","scope":"scope","versions":[{"hash":old,"parents":[]}],
            "graphCompleteRefs":[old]
        }),
    );
    let mut repository = Repository::new(fixture.root(), None);
    let mut objects = Vec::new();
    tag_histories(fixture.root(), &[material(&head)], &mut objects, &mut repository).unwrap();
    assert_eq!(objects.len(), 1);
    assert_eq!(objects[0]["type"], "VersionHistory");
    let fields = serde_json::from_value(objects[0]["fields"].clone()).unwrap();
    let body = crate::snapshot_projection::serialize("VersionHistory", &fields, false).unwrap();
    let history: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        history["versions"],
        json!([
            {"hash":old,"parents":[]},{"hash":head,"parents":[old]},
        ]),
    );
    assert_eq!(history["graphCompleteRefs"], json!([old]));
    assert!(!String::from_utf8(body).unwrap().contains(&allocated_tag));
    repository.validate().unwrap();
}

#[test]
fn tag_does_not_create_missing_history_or_touch_complete_history() {
    let fixture = Fixture::new();
    let head = "b".repeat(40);
    let mut repository = Repository::new(fixture.root(), None);
    let mut objects = Vec::new();
    tag_histories(fixture.root(), &[material(&head)], &mut objects, &mut repository).unwrap();
    assert!(objects.is_empty());
    fixture.object(
        &status_history::identity("scope/component"),
        "VersionHistory",
        &json!({
            "name":"component","scope":"scope","versions":[{"hash":head,"parents":[]}],
            "graphCompleteRefs":[head]
        }),
    );
    let mut repository = Repository::new(fixture.root(), None);
    tag_histories(fixture.root(), &[material(&head)], &mut objects, &mut repository).unwrap();
    assert!(objects.is_empty());
}
