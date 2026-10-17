use super::{Detect, detect, proof};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-fresh-deps-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join("comp")).unwrap();
        Self(root)
    }
    fn write(&self, name: &str, source: &str) {
        let file = self.0.join(name);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, source).unwrap();
    }
    fn request(&self, files: &[&str]) -> Value {
        json!({"root":self.0,"componentRoot":self.0.join("comp"),"identity":"scope/comp@1.0.0","files":files.iter().map(|file|self.0.join("comp").join(file)).collect::<Vec<_>>(),"detection":{"graph":{"builtins":["fs","node:fs"],"detectorExtensions":[".js",".ts",".tsx",".jsonc"],"typescript":true},"devFiles":["index.spec.ts"],"modelPackages":[{},{},{}],"workspacePolicy":[{},{},{}],"corePackages":["@teambit/example"],"workspaceComponents":["scope/comp@1.0.0","scope/other@2.0.0"]}})
    }
    fn run(request: Value) -> io::Result<Value> {
        let request: Detect = serde_json::from_value(request).unwrap();
        detect(
            &request,
            &rayon::ThreadPoolBuilder::new()
                .num_threads(4)
                .build()
                .unwrap(),
        )
        .map(|(_, value)| value)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn detects_packages_types_and_original_file_lifecycles() {
    let fixture = Fixture::new();
    fixture.write("comp/index.ts", "import 'pkg'; import './internal';");
    fixture.write("comp/index.spec.ts", "import 'pkg';");
    fixture.write("comp/internal.ts", "export const x = 1;");
    fixture.write(
        "node_modules/pkg/package.json",
        r#"{"name":"pkg","version":"1.2.3","main":"index.js"}"#,
    );
    fixture.write("node_modules/pkg/index.js", "module.exports = 1;");
    let mut input = fixture.request(&["index.spec.ts", "index.ts", "internal.ts"]);
    input["detection"]["modelPackages"][0] = json!({"pkg":"^1.0.0"});
    input["detection"]["workspacePolicy"][1] = json!({"@types/pkg":"^4.0.0"});
    let output = Fixture::run(input).unwrap();
    assert_eq!(
        output["detected"]["allPackagesDependencies"],
        json!({"packageDependencies":{"pkg":"^1.0.0"},"devPackageDependencies":{"@types/pkg":"^4.0.0","pkg":"^1.0.0"},"peerPackageDependencies":{}}),
    );
    let read_set: Vec<proof::Proof> = serde_json::from_value(output["readSet"].clone()).unwrap();
    proof::verify(&read_set).unwrap();
    fixture.write("comp/internal.ts", "export const x = 2;");
    assert!(proof::verify(&read_set).is_err());
}
#[test]
fn linked_component_versions_are_returned_for_semver_receipts() {
    let fixture = Fixture::new();
    fixture.write("comp/index.js", "require('other');");
    fixture.write("node_modules/other/package.json", r#"{"name":"other","version":"2.0.0","main":"index.js","componentId":{"scope":"scope","name":"other","version":"2.0.0"}}"#);
    fixture.write("node_modules/other/index.js", "module.exports = 1;");
    let output = Fixture::run(fixture.request(&["index.js"])).unwrap();
    assert_eq!(output["grammarInputs"], json!(["2.0.0"]));
    assert_eq!(
        output["componentVersions"],
        json!([{"field":0,"index":0,"concrete":"2.0.0","dependent":null}]),
    );
    assert_eq!(output["detected"]["allDependencies"]["dependencies"][0]["packageName"], "other");
    let read_set: Vec<proof::Proof> = serde_json::from_value(output["readSet"].clone()).unwrap();
    fixture.write("comp/component.json", "{}");
    assert!(proof::verify(&read_set).is_err());
}
#[test]
fn detects_untracked_sources_and_rejects_incomplete_core_package_mapping() {
    let fixture = Fixture::new();
    fixture.write("comp/index.js", "require('./untracked');");
    fixture.write("comp/untracked.js", "module.exports = 1;");
    let detected = Fixture::run(fixture.request(&["index.js"])).unwrap();
    assert_eq!(detected["detected"]["issues"][0]["type"], "UntrackedDependencies");
    fixture.write("comp/index.js", "require('@teambit/example');");
    fixture.write(
        "node_modules/@teambit/example/package.json",
        r#"{"name":"@teambit/example","version":"1.0.0"}"#,
    );
    fixture.write("node_modules/@teambit/example/index.js", "module.exports = 1;");
    assert!(Fixture::run(fixture.request(&["index.js"])).is_err());
}
#[test]
fn resolution_proof_rejects_new_higher_priority_package() {
    let fixture = Fixture::new();
    fixture.write("comp/index.js", "require('pkg');");
    fixture.write("node_modules/pkg/package.json", r#"{"name":"pkg","version":"1.0.0"}"#);
    fixture.write("node_modules/pkg/index.js", "module.exports = 1;");
    let output = Fixture::run(fixture.request(&["index.js"])).unwrap();
    let read_set: Vec<proof::Proof> = serde_json::from_value(output["readSet"].clone()).unwrap();
    proof::verify(&read_set).unwrap();
    fixture.write("comp/node_modules/pkg/package.json", r#"{"name":"pkg","version":"2.0.0"}"#);
    fixture.write("comp/node_modules/pkg/index.js", "module.exports = 2;");
    assert!(proof::verify(&read_set).is_err());
}
#[cfg(unix)]
#[test]
fn resolution_proof_rejects_retargeted_link_with_identical_manifest() {
    let fixture = Fixture::new();
    fixture.write("comp/index.js", "require('pkg');");
    for target in ["first", "second"] {
        fixture.write(&format!("{target}/package.json"), r#"{"name":"pkg","version":"1.0.0"}"#);
        fixture.write(&format!("{target}/index.js"), "module.exports = 1;");
    }
    fs::create_dir_all(fixture.0.join("node_modules")).unwrap();
    let link = fixture.0.join("node_modules/pkg");
    std::os::unix::fs::symlink(fixture.0.join("first"), &link).unwrap();
    let output = Fixture::run(fixture.request(&["index.js"])).unwrap();
    let read_set: Vec<proof::Proof> = serde_json::from_value(output["readSet"].clone()).unwrap();
    proof::verify(&read_set).unwrap();
    fs::remove_file(&link).unwrap();
    std::os::unix::fs::symlink(fixture.0.join("second"), &link).unwrap();
    assert!(proof::verify(&read_set).is_err());
}
#[test]
fn retained_sources_project_the_same_raw_data_as_the_post_write_workspace() {
    let fixture = Fixture::new();
    fixture.write("comp/index.ts", "import './removed';");
    fixture.write("comp/removed.ts", "export const old = 1;");
    fixture.write(
        "node_modules/pkg/package.json",
        r#"{"name":"pkg","version":"3.1.0","main":"index.js"}"#,
    );
    fixture.write("node_modules/pkg/index.js", "module.exports = 1;");
    let mut overlay =
        crate::workspace::engine::source_overlay::SourceOverlay::new(&fixture.0).unwrap();
    let images = [("index.ts", "import './index.spec';"), ("index.spec.ts", "import 'pkg';")];
    for (name, body) in images {
        let spool = fixture.0.join(format!("{name}.spool"));
        fs::write(&spool, body).unwrap();
        overlay.insert_source(&fixture.0.join("comp").join(name), &json!({"spoolPath":spool,"bytes":body.len(),"spoolHash":crate::workspace::engine::hash(body.as_bytes())})).unwrap();
    }
    overlay
        .remove(&fixture.0.join("comp/removed.ts"))
        .unwrap();
    let overlay = overlay.seal().unwrap();
    let input = fixture.request(&["index.ts", "index.spec.ts"]);
    let request = serde_json::from_value(input.clone()).unwrap();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    let (_, projected) = super::detect_overlay(&request, &pool, &overlay).unwrap();
    let proofs: Vec<proof::Proof> = serde_json::from_value(projected["readSet"].clone()).unwrap();
    proof::verify(&proofs).unwrap();
    for (name, body) in images {
        fixture.write(&format!("comp/{name}"), body);
    }
    fs::remove_file(fixture.0.join("comp/removed.ts")).unwrap();
    let actual = Fixture::run(input).unwrap();
    for field in ["detected", "componentVersions", "grammarInputs"] {
        assert_eq!(projected[field], actual[field], "{field}");
    }
    assert!(proof::verify(&proofs).is_err());
}

#[test]
fn installed_external_component_retains_package_identity_and_freshness() {
    let fixture = Fixture::new();
    fixture.write("comp/index.js", "require('@external/aspect');");
    fixture.write("node_modules/@external/aspect/package.json", r#"{"name":"@external/aspect","version":"0.4.12","main":"index.js","componentId":{"scope":"external.scope","name":"aspect","version":"0.4.12"}}"#);
    fixture.write("node_modules/@external/aspect/index.js", "module.exports = 1;");
    let request = fixture.request(&["index.js"]);
    let output = Fixture::run(request.clone()).unwrap();
    assert_eq!(
        output["detected"]["allDependencies"]["dependencies"],
        json!([{
            "id":{"scope":"external.scope","name":"aspect","version":"0.4.12"},
            "relativePaths":[],"packageName":"@external/aspect"
        }]),
    );
    assert_eq!(output["grammarInputs"], json!(["0.4.12"]));
    let read_set: Vec<proof::Proof> = serde_json::from_value(output["readSet"].clone()).unwrap();
    proof::verify(&read_set).unwrap();
    fixture.write("node_modules/@external/aspect/package.json", r#"{"name":"@external/aspect","version":"0.4.13","main":"index.js","componentId":{"scope":"external.scope","name":"aspect","version":"0.4.13"},"bit":{"peer":true}}"#);
    assert!(proof::verify(&read_set).is_err());
    let peer = Fixture::run(request).unwrap();
    assert_eq!(peer["detected"]["allDependencies"]["peerDependencies"][0]["peerVersionRange"], "*");
}
