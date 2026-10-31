use super::SourceOverlay;
use crate::workspace::engine::{
    dependency_graph::proof,
    resolve_dependencies::{Budget, resolve_one},
};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-source-overlay-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn source(&self, body: &[u8]) -> serde_json::Value {
        let path = self.0.join(format!("spool-{}", NEXT.fetch_add(1, Ordering::Relaxed)));
        let mut bytes = vec![0; 1024 * 1024 + 17];
        bytes.extend(body);
        fs::write(&path, bytes).unwrap();
        json!({"spoolPath":path,"spoolOffset":1024*1024+17,"bytes":body.len(),"spoolHash":crate::workspace::engine::hash(body)})
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _removed = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn added_and_deleted_candidates_change_resolution_without_touching_disk() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("child.js"), b"old").unwrap();
    let mut overlay = SourceOverlay::new(&fixture.0).unwrap();
    overlay
        .insert_source(&fixture.0.join("child"), &fixture.source(b"new"))
        .unwrap();
    overlay
        .remove(&fixture.0.join("child.js"))
        .unwrap();
    let overlay = overlay.seal().unwrap();
    let budget = Budget::overlay(&overlay).unwrap();
    assert_eq!(
        resolve_one("./child", &fixture.0, None, &budget, "commonjs").unwrap(),
        Some(
            fixture.0
                .join("child")
                .to_str()
                .unwrap()
                .to_owned()
        ),
    );
    assert!(
        budget
            .metadata(&fixture.0.join("child.js"))
            .unwrap()
            .is_none(),
    );
    assert_eq!(
        budget
            .read_source(&fixture.0.join("child"))
            .unwrap()
            .unwrap(),
        b"new",
    );
    assert_eq!(fs::read(fixture.0.join("child.js")).unwrap(), b"old");
    assert!(!fixture.0.join("child").exists());
    proof::verify(&budget.proofs().unwrap()).unwrap();
}
#[test]
fn retained_ranges_validate_without_reading_unrelated_large_spool_prefix() {
    let fixture = Fixture::new();
    let source = fixture.source(b"body");
    let mut overlay = SourceOverlay::new(&fixture.0).unwrap();
    overlay
        .insert_source(&fixture.0.join("new.js"), &source)
        .unwrap();
    let overlay = overlay.seal().unwrap();
    proof::verify(&overlay.proofs().unwrap()).unwrap();
    fs::write(fixture.0.join("new.js"), b"racing writer").unwrap();
    assert!(proof::verify(&overlay.proofs().unwrap()).is_err());
    fs::remove_file(fixture.0.join("new.js")).unwrap();
    let path = source["spoolPath"].as_str().unwrap();
    let mut bytes = fs::read(path).unwrap();
    *bytes.last_mut().unwrap() = b'!';
    fs::write(path, bytes).unwrap();
    assert!(proof::verify(&overlay.proofs().unwrap()).is_err());
}
#[test]
fn staged_manifest_reads_share_the_retained_view() {
    let fixture = Fixture::new();
    let component = fixture.0.join("component");
    fs::create_dir_all(&component).unwrap();
    let linked = fixture.0.join("node_modules").join("pkg");
    let mut overlay = SourceOverlay::new(&fixture.0).unwrap();
    overlay
        .insert_source(&linked.join("fresh.js"), &fixture.source(b"module.exports=1"))
        .unwrap();
    overlay
        .insert_source(
            &linked.join("package.json"),
            &fixture.source(br#"{"name":"pkg","version":"2.0.0","main":"fresh.js"}"#),
        )
        .unwrap();
    let overlay = overlay.seal().unwrap();
    let budget = Budget::overlay(&overlay).unwrap();
    assert_eq!(
        resolve_one("pkg", &fixture.0, None, &budget, "commonjs").unwrap(),
        Some(
            linked
                .join("fresh.js")
                .to_str()
                .unwrap()
                .to_owned()
        ),
    );
    assert_eq!(
        budget
            .package(&linked.join("package.json"))
            .unwrap()
            .unwrap()["version"],
        "2.0.0",
    );
    assert!(!linked.exists());
}
#[test]
fn graph_traverses_retained_bodies_at_original_paths() {
    let fixture = Fixture::new();
    let index = fixture.0.join("index.js");
    let added = fixture.0.join("added.js");
    let standalone = fixture.0.join("new.spec.js");
    fs::write(&index, b"require('./missing')").unwrap();
    let mut overlay = SourceOverlay::new(&fixture.0).unwrap();
    overlay
        .insert_source(&index, &fixture.source(b"require('./added')"))
        .unwrap();
    overlay
        .insert_source(&added, &fixture.source(b"module.exports=1"))
        .unwrap();
    overlay
        .insert_source(&standalone, &fixture.source(b"module.exports=2"))
        .unwrap();
    let overlay = overlay.seal().unwrap();
    let request = serde_json::from_value(json!({"root":fixture.0,"files":[index,standalone],"home":null,"builtins":[],"detectorExtensions":[".js"],"typescript":true,"includeNpm":true,"visited":{}})).unwrap();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    let (_, graph) =
        crate::workspace::engine::dependency_graph::capture_overlay(&request, &pool, &overlay)
            .unwrap();
    assert_eq!(graph["tree"][index.to_str().unwrap()], json!([added]));
    assert_eq!(graph["tree"][standalone.to_str().unwrap()], json!([]));
    assert!(!standalone.exists());
    assert_eq!(fs::read(&index).unwrap(), b"require('./missing')");
    let proofs: Vec<proof::Proof> = serde_json::from_value(graph["readSet"].clone()).unwrap();
    proof::verify(&proofs).unwrap();
}
#[test]
fn typescript_candidate_priority_includes_virtual_files() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("child.js"), b"module.exports=1").unwrap();
    let mut overlay = SourceOverlay::new(&fixture.0).unwrap();
    overlay
        .insert_source(&fixture.0.join("child.ts"), &fixture.source(b"export const value=1"))
        .unwrap();
    let overlay = overlay.seal().unwrap();
    let budget = Budget::overlay(&overlay).unwrap();
    assert_eq!(
        resolve_one("./child.js", &fixture.0, None, &budget, "typescript5.9").unwrap(),
        Some(
            fixture.0
                .join("child.ts")
                .to_str()
                .unwrap()
                .to_owned()
        ),
    );
}
#[test]
#[cfg(unix)]
fn existing_link_aliases_see_staged_content_and_retargeting_invalidates_proofs() {
    let fixture = Fixture::new();
    let component = fixture.0.join("component");
    fs::create_dir_all(&component).unwrap();
    let alias = fixture.0.join("alias");
    std::os::unix::fs::symlink(&component, &alias).unwrap();
    let mut overlay = SourceOverlay::new(&fixture.0).unwrap();
    overlay
        .insert_source(&component.join("new.js"), &fixture.source(b"new"))
        .unwrap();
    let overlay = overlay.seal().unwrap();
    let budget = Budget::overlay(&overlay).unwrap();
    assert_eq!(
        budget
            .read_source(&alias.join("new.js"))
            .unwrap()
            .unwrap(),
        b"new",
    );
    let proofs = budget.proofs().unwrap();
    proof::verify(&proofs).unwrap();
    fs::remove_file(&alias).unwrap();
    std::os::unix::fs::symlink(&fixture.0, &alias).unwrap();
    assert!(proof::verify(&proofs).is_err());
}
