use super::ci_requires_published_diagnostic;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

struct Fixture {
    temporary: tempfile::TempDir,
    root: PathBuf,
    remote: PathBuf,
    global: PathBuf,
    hash: String,
}
impl Fixture {
    fn new() -> Self {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("workspace");
        let remote = temporary.path().join("remote");
        fs::create_dir_all(root.join(".bit/objects")).unwrap();
        fs::create_dir_all(remote.join("objects")).unwrap();
        let global = temporary.path().join("global.json");
        let hash = "a".repeat(40);
        let value = Self { temporary, root, remote, global, hash };
        value.configure(&format!("file://{}", value.remote.display()));
        write_json(&value.remote.join("scope.json"), &json!({"name":"remote.scope"}));
        write_json(
            &value.root.join(".bitmap"),
            &json!({"_bit_lane":{"id":{"scope":"remote.scope","name":"dev"}}}),
        );
        let index = json!({"components":[],"lanes":[{"id":{"scope":"remote.scope","name":"dev"},"hash":value.hash}]});
        write_json(&value.root.join(".bit/index.json"), &index);
        write_json(&value.remote.join("index.json"), &index);
        let lane = json!({"name":"dev","scope":"remote.scope","components":[]});
        object(&value.root.join(".bit/objects"), &value.hash, "Lane", &lane);
        object(&value.remote.join("objects"), &value.hash, "Lane", &lane);
        value
    }
    fn configure(&self, host: &str) {
        write_json(
            &self.root.join(".bit/scope.json"),
            &json!({"name":"local.scope","remotes":{"remote.scope":host}}),
        );
    }
    fn history(&self, directory: &Path) {
        let value = json!({"name":"dev","scope":"remote.scope","laneHash":self.hash,"history":{"known":{"log":{"date":"123"},"components":[]}}});
        object(directory, &crate::lane_history::hash(&self.hash), "LaneHistory", &value);
    }
    fn requires(&self, key: &str) -> bool {
        ci_requires_published_diagnostic(&self.root, &self.global, key).unwrap()
    }
}

#[test]
fn cached_key_stays_native_without_contacting_an_http_remote() {
    let fixture = Fixture::new();
    fixture.configure("https://unreachable.invalid");
    fixture.history(&fixture.root.join(".bit/objects"));
    assert!(!fixture.requires("known"));
    assert!(fixture.requires("missing"));
    assert!(!fixture.global.exists());
}

#[test]
fn file_remote_key_is_proved_without_publishing_history_or_refs() {
    let fixture = Fixture::new();
    fixture.history(&fixture.remote.join("objects"));
    let before = snapshot(fixture.temporary.path());
    assert!(!fixture.requires("known"));
    assert!(fixture.requires("missing"));
    assert_eq!(snapshot(fixture.temporary.path()), before);
}

#[test]
fn new_lane_does_not_consult_a_remote_history() {
    let fixture = Fixture::new();
    fixture.history(&fixture.remote.join("objects"));
    let scope = json!({"name":"local.scope","lanes":{"new":["dev"]},"remotes":{"remote.scope":format!("file://{}",fixture.remote.display())}});
    write_json(&fixture.root.join(".bit/scope.json"), &scope);
    assert!(fixture.requires("known"));
}

#[test]
fn main_and_an_absent_file_remote_key_require_the_released_diagnostic() {
    let fixture = Fixture::new();
    assert!(fixture.requires("missing"));
    write_json(&fixture.root.join(".bitmap"), &json!({}));
    assert!(fixture.requires("known"));
}

#[test]
fn corrupt_local_history_is_not_treated_as_a_missing_key() {
    let fixture = Fixture::new();
    let hash = crate::lane_history::hash(&fixture.hash);
    let path = fixture.root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, b"not zlib").unwrap();
    assert!(ci_requires_published_diagnostic(&fixture.root, &fixture.global, "known").is_err());
}

fn write_json(path: &Path, value: &Value) {
    fs::write(path, serde_json::to_vec(value).unwrap()).unwrap();
}
fn object(directory: &Path, hash: &str, kind: &str, value: &Value) {
    let text = serde_json::to_string(value).unwrap();
    let header = format!("{kind} {hash} {}\0", text.encode_utf16().count());
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(header.as_bytes()).unwrap();
    encoder.write_all(text.as_bytes()).unwrap();
    let path = directory
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, encoder.finish().unwrap()).unwrap();
}
fn snapshot(root: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    fn visit(root: &Path, rows: &mut Vec<(PathBuf, Vec<u8>)>) {
        for entry in fs::read_dir(root).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(&path, rows);
            } else {
                rows.push((path.clone(), fs::read(path).unwrap()));
            }
        }
    }
    let mut rows = Vec::new();
    visit(root, &mut rows);
    rows.sort();
    rows
}
