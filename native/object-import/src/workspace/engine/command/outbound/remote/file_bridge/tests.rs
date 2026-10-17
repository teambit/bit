use super::FileBridge;
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-file-action-bridge-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(path.join("node_modules/@teambit/legacy.scope-api")).unwrap();
        fs::write(
            path.join("node_modules/@teambit/legacy.scope-api/index.js"),
            r"
let count = 0;
exports.action = async (path, name, options) => {
  count++;
  process.stdout.write('server action diagnostic\n');
  if (name === 'Fail') throw new Error('expected action failure');
  return { path, name, clientId: options.clientId, count, pid: process.pid };
};
",
        )
        .unwrap();
        Self(path)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn one_child_handles_multiple_scopes_and_errors() {
    let fixture = Fixture::new();
    let mut bridge = FileBridge::spawn(Path::new("node"), &fixture.0).unwrap();
    let first = bridge
        .call(Path::new("/scope-one"), "ExportValidate", &json!({"clientId":"one"}))
        .unwrap();
    assert_eq!(first["count"], 1);
    assert_eq!(first["path"], "/scope-one");
    assert_eq!(
        bridge
            .call(Path::new("/scope-two"), "Fail", &json!({"clientId":"one"}))
            .unwrap_err()
            .to_string(),
        "expected action failure",
    );
    let last = bridge
        .call(Path::new("/scope-two"), "ExportPersist", &json!({"clientId":"one"}))
        .unwrap();
    assert_eq!(last["count"], 3);
    assert_eq!(last["pid"], first["pid"]);
    assert_eq!(last["clientId"], "one");
}
