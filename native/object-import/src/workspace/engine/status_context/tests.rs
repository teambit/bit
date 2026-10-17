use super::{Request, read};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-status-context-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join(".bit/objects")).unwrap();
        fs::create_dir_all(root.join("home")).unwrap();
        fs::create_dir_all(root.join("alpha")).unwrap();
        for (file, contents) in [
            (
                "workspace.jsonc",
                json!({"teambit.workspace/workspace":{"defaultScope":"test.scope"}}),
            ),
            (
                ".bitmap",
                json!({"$schema-version":"17.0.0","alpha":{"name":"alpha","scope":"","version":"","rootDir":"alpha","mainFile":"index.js"}}),
            ),
            (".bit/scope.json", json!({"name":"test.scope","lanes":{"current":"main"}})),
            (".bit/index.json", json!({"components":[]})),
        ] {
            fs::write(root.join(file), serde_json::to_vec(&contents).unwrap()).unwrap();
        }
        Self(root)
    }
    fn context(&self) -> io::Result<Value> {
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(2)
            .build()
            .unwrap();
        read(&Request { root: self.0.clone(), home: self.0.join("home"), history: true }, &pool)
            .map(|(_, value)| value)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn current_component_policy_is_reread_without_harmony() {
    let fixture = Fixture::new();
    let file = fixture.0.join("alpha/component.json");
    for version in ["^1.0.0", "^2.0.0"] {
        fs::write(&file, serde_json::to_vec(&json!({"componentId":{"scope":"test.scope","name":"alpha"},"extensions":{
            "teambit.dependencies/dependency-resolver":{"policy":{"dependencies":{"example":version}}}
        }})).unwrap()).unwrap();
        let value = fixture.context().unwrap();
        assert_eq!(
            value["targets"][0]["config"]["extensions"]["teambit.dependencies/dependency-resolver"]
                ["policy"]["dependencies"]["example"],
            version,
        );
        assert_eq!(value["targets"][0]["mainFile"], "index.js");
        assert_eq!(value["models"], json!([]));
        assert_eq!(value["options"]["trackAllFiles"], false);
    }
}

#[test]
fn temporary_output_is_not_source_and_invalid_component_configuration_declines() {
    let fixture = Fixture::new();
    fs::create_dir(fixture.0.join(".bitTmp")).unwrap();
    assert!(fixture.context().is_ok());
    fs::remove_dir(fixture.0.join(".bitTmp")).unwrap();
    fs::write(
        fixture.0.join("alpha/component.json"),
        br#"{"extensions":{"custom.scope/provider":{}}}"#,
    )
    .unwrap();
    assert!(fixture.context().is_err());
    fs::remove_file(fixture.0.join("alpha/component.json")).unwrap();
    assert!(fixture.context().is_ok());
    fs::write(fixture.0.join("merge-conflict"), b"conflict").unwrap();
    assert!(fixture.context().is_ok());
}

#[test]
fn metadata_budget_and_non_json_packages_decline() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("alpha/package.json"), br#"{/*comment*/"name":"alpha"}"#).unwrap();
    assert!(fixture.context().is_err());
    fs::write(fixture.0.join("alpha/package.json"), vec![b' '; 1024 * 1024 + 1]).unwrap();
    assert!(fixture.context().is_err());
}

#[test]
fn lane_header_sets_current_lane_without_becoming_component_target() {
    let fixture = Fixture::new();
    let bitmap = json!({"$schema-version":"17.0.0",
        "alpha":{"name":"alpha","scope":"","version":"","rootDir":"alpha","mainFile":"index.js"},
        "_bit_lane":{"id":{"scope":"test.scope","name":"study"},"exported":false}});
    fs::write(fixture.0.join(".bitmap"), serde_json::to_vec(&bitmap).unwrap()).unwrap();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    let request = Request { root: fixture.0.clone(), home: fixture.0.join("home"), history: false };
    let value = super::metadata(&request, &pool).unwrap();
    assert_eq!(value["currentLaneId"], "test.scope/study");
    assert_eq!(
        value["targets"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(value["targets"][0]["identity"], "test.scope/alpha");
}

#[test]
fn control_proofs_cover_changed_and_new_component_configuration() {
    for file in ["workspace.jsonc", ".bitmap", "alpha/component.json"] {
        let fixture = Fixture::new();
        let context = fixture.context().unwrap();
        let proofs: Vec<super::proof::Proof> =
            serde_json::from_value(context["controlReadSet"].clone()).unwrap();
        super::proof::verify(&proofs).unwrap();
        fs::write(fixture.0.join(file), b"{}").unwrap();
        assert!(super::proof::verify(&proofs).is_err(), "{file}");
    }
}
