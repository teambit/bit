use super::{Budget, Comparison, Source, compare, proof};
use std::{
    collections::HashSet,
    fs, io,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);

#[test]
fn retained_fast_forward_sources_preserve_imports_and_detect_stale_capture() {
    use serde_json::json;
    let fixture = Fixture::new();
    let current_path = fixture.0.join("component/index.js");
    let spool = fixture.0.join("retained-source");
    let original = b"module.exports = 1;";
    fs::write(&current_path, original).unwrap();
    let current = crate::workspace::engine::command::capture::Captured {
        added: false,
        hidden: false,
        target: serde_json::from_value(json!({"identity":"scope/peer","version":"1.0.0",
            "directory":"component","files":["index.js"],"current":{}}))
        .unwrap(),
        metadata: json!([]),
        files: json!([{"relativePath":"index.js","path":current_path,
            "rawHash":crate::workspace::engine::hash(original)}]),
    };
    let grammar = json!({"builtins":["fs"],"detectorExtensions":[".js"],"typescript":true});
    for (body, supported) in
        [("module.exports = 2;", true), ("require('fs'); module.exports = 2;", false)]
    {
        fs::write(&spool, body).unwrap();
        let rows = vec![json!({"relativePath":"index.js","source":{"spoolPath":spool,
            "spoolHash":crate::workspace::engine::hash(body.as_bytes()),"bytes":body.len()}})];
        assert_eq!(
            super::verify(&fixture.0, &fixture.0, &current, &rows, &grammar).is_ok(),
            supported,
        );
    }
    fs::write(&current_path, b"module.exports = 3;").unwrap();
    assert!(super::verify(&fixture.0, &fixture.0, &current, &[], &grammar).is_err());
}
struct Fixture(std::path::PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-merge-dependency-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join("component")).unwrap();
        Self(root)
    }
    fn compare(
        &self,
        name: &str,
        old: Option<&str>,
        new: Option<&str>,
        changed: bool,
    ) -> io::Result<Vec<proof::Proof>> {
        let old = old.map(|text| Source { bytes: text.as_bytes().to_vec(), proof: None });
        let new = new.map(|text| Source { bytes: text.as_bytes().to_vec(), proof: None });
        let budget = Budget::capture(true);
        let mut proofs = compare(
            &Comparison {
                root: &self.0,
                home: &self.0,
                directory: "component",
                topology_changed: changed,
                builtins: &HashSet::from(["fs", "node:fs"]),
                detectors: &HashSet::from([".js", ".ts", ".css", ".jsonc"]),
                typescript: true,
                budget: &budget,
            },
            name,
            old.as_ref(),
            new.as_ref(),
        )?;
        proofs.extend(budget.proofs()?);
        Ok(proofs)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
#[test]
fn source_edits_keep_imports_but_new_or_removed_imports_decline() {
    let fixture = Fixture::new();
    assert!(
        fixture
            .compare(
                "index.js",
                Some("const fs=require('fs'); module.exports=1"),
                Some("const fs=require('fs'); module.exports=2"),
                false
            )
            .is_ok(),
    );
    assert!(
        fixture
            .compare(
                "index.js",
                Some("module.exports=1"),
                Some("const fs=require('fs'); module.exports=2"),
                false
            )
            .is_err(),
    );
    assert!(
        fixture
            .compare("index.js", Some("const fs=require('fs')"), Some("module.exports=2"), false)
            .is_err(),
    );
    assert!(
        fixture
            .compare("new.ts", None, Some("export const value=1"), true)
            .is_ok(),
    );
    assert!(
        fixture
            .compare("asset.txt", None, Some("opaque asset"), true)
            .is_ok(),
    );
    assert!(
        fixture
            .compare("style.css", Some("a{}"), Some("b{}"), false)
            .is_err(),
    );
    assert!(
        fixture
            .compare("package.json", None, Some("{}"), true)
            .is_err(),
    );
}
#[test]
fn relative_topology_changes_decline_and_resolution_proofs_detect_new_candidates() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("component/dependency.js"), b"module.exports=1").unwrap();
    let source = "module.exports=require('./dependency')";
    assert!(
        fixture
            .compare("index.js", Some(source), Some(source), true)
            .is_err(),
    );
    let proofs = fixture
        .compare("index.js", Some(source), Some(source), false)
        .unwrap();
    proof::verify(&proofs).unwrap();
    fs::write(fixture.0.join("component/dependency"), b"module.exports=2").unwrap();
    assert!(proof::verify(&proofs).is_err());
}
#[test]
fn package_manifest_changes_invalidate_resolution_proof() {
    let fixture = Fixture::new();
    let package = fixture.0.join("node_modules/pkg");
    fs::create_dir_all(&package).unwrap();
    fs::write(
        package.join("package.json"),
        br#"{"name":"pkg","main":"index.js","version":"1.0.0"}"#,
    )
    .unwrap();
    fs::write(package.join("index.js"), b"module.exports=1").unwrap();
    let source = "module.exports=require('pkg')";
    let proofs = fixture
        .compare("index.js", Some(source), Some(source), false)
        .unwrap();
    proof::verify(&proofs).unwrap();
    fs::write(
        package.join("package.json"),
        br#"{"name":"pkg","main":"index.js","version":"2.0.0"}"#,
    )
    .unwrap();
    assert!(proof::verify(&proofs).is_err());
}
