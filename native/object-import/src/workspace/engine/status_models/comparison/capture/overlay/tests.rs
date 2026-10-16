use crate::workspace::engine::status_models::comparison::{Request, Target, capture};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let root = std::env::temp_dir()
            .join(format!(
                "bit-callback-source-overlay-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("spooled"), b"callback contents\r\n").unwrap();
        Self(root)
    }
    fn target(&self) -> Target {
        serde_json::from_value(json!({"identity":"scope/comp","version":"1.0.0","directory":".","files":["virtual.js"],"current":{"mainFile":"virtual.js"},"sourceOverlayRoot":self.0,"sourceOverlays":{"virtual.js":self.0.join("spooled")}})).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn overlay_manifest_rejects_unknown_and_duplicate_entries() {
    let fixture = Fixture::new();
    let mut target = fixture.target();
    target.source_overlays.insert("unknown.js".into(), fixture.0.join("spooled"));
    assert!(capture::validate(&target).is_err());
    target.source_overlays.remove("unknown.js");
    target.files.push("virtual.js".into());
    assert!(capture::validate(&target).is_err());
}

#[test]
fn overlay_sources_must_stay_inside_the_private_root() {
    let fixture = Fixture::new();
    let mut target = fixture.target();
    target.source_overlays.insert(
        "virtual.js".into(),
        fixture.0
            .parent()
            .unwrap()
            .join("outside"),
    );
    assert!(capture::source_path(&fixture.0, &target, "virtual.js").is_err());
    target.source_overlays.insert("virtual.js".into(), fixture.0.join("../outside"));
    assert!(capture::source_path(&fixture.0, &target, "virtual.js").is_err());
}

#[cfg(unix)]
#[test]
fn overlay_sources_reject_symlinks_and_symlinked_parent_directories() {
    let fixture = Fixture::new();
    let mut target = fixture.target();
    std::os::unix::fs::symlink(fixture.0.join("spooled"), fixture.0.join("link")).unwrap();
    target.source_overlays.insert("virtual.js".into(), fixture.0.join("link"));
    assert!(capture::source_path(&fixture.0, &target, "virtual.js").is_err());
    std::os::unix::fs::symlink(&fixture.0, fixture.0.join("directory-link")).unwrap();
    target.source_overlays.insert("virtual.js".into(), fixture.0.join("directory-link/spooled"));
    assert!(capture::source_path(&fixture.0, &target, "virtual.js").is_err());
}

#[test]
fn overlay_capture_hashes_native_contents_and_enforces_the_shared_byte_budget() {
    let fixture = Fixture::new();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    let request = Request { root: fixture.0.clone(), targets: vec![fixture.target()] };
    let captured = capture::all(&request, &pool).unwrap();
    let normalized = crate::workspace::engine::read::canonical(
        &fixture.0.join("spooled"),
        b"callback contents\r\n".to_vec(),
    )
    .0;
    assert_eq!(captured[0][0]["file"], normalized.linux_hash);
    fs::OpenOptions::new()
        .write(true)
        .open(fixture.0.join("spooled"))
        .unwrap()
        .set_len(8 * 1024 * 1024 + 1)
        .unwrap();
    assert!(capture::all(&request, &pool).is_err());
}

#[test]
fn overlay_spool_changes_invalidate_the_dependency_freshness_receipt() {
    use crate::workspace::engine::dependency_graph::proof;
    let fixture = Fixture::new();
    let path = capture::source_path(&fixture.0, &fixture.target(), "virtual.js").unwrap();
    let mut proofs = Vec::new();
    proof::read(&path, &mut proofs).unwrap();
    let receipt: proof::Request = serde_json::from_value(json!({"readSet":proofs})).unwrap();
    assert!(proof::apply(&receipt).is_ok());
    fs::write(path, b"changed callback contents").unwrap();
    assert!(proof::apply(&receipt).is_err());
    assert!(!fixture.0.join("virtual.js").exists());
}

#[test]
fn bitmap_overlay_normalizes_by_logical_path() {
    let fixture = Fixture::new();
    let body = br#"// bitmap comments
{"foo":{"name":"foo","scope":"scope","version":"1.0.0","rootDir":"foo","mainFile":"index.js"},"$schema-version":"17.0.0"}"#;
    fs::write(fixture.0.join(".bitmap"), body).unwrap();
    fs::write(fixture.0.join("spooled"), body).unwrap();
    let mut target = fixture.target();
    target.files = vec![".bitmap".into()];
    target.current["mainFile"] = json!(".bitmap");
    target.source_overlays.clear();
    let mut request = Request { root: fixture.0.clone(), targets: vec![target] };
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .unwrap();
    let expected = capture::all(&request, &pool).unwrap();
    request.targets[0].source_overlays.insert(".bitmap".into(), fixture.0.join("spooled"));
    assert_eq!(capture::all(&request, &pool).unwrap(), expected);
}
