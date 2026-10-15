use super::{Finish, Prepare, Scan, State, complete, finish, prepare, scan};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{self, Write},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-cold-status-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join(".bit/objects")).unwrap();
        fs::create_dir_all(root.join("home")).unwrap();
        fs::create_dir_all(root.join("alpha")).unwrap();
        fs::write(
            root.join("workspace.jsonc"),
            br#"{"teambit.workspace/workspace":{"defaultScope":"test.scope"}}"#,
        )
        .unwrap();
        fs::write(root.join(".bit/scope.json"), br#"{"lanes":{"current":"main"}}"#).unwrap();
        fs::write(root.join(".bitmap"), br#"{"alpha":{"name":"alpha","scope":"","version":"1.0.0","rootDir":"alpha","mainFile":"index.js"},"$schema-version":"17.0.0"}"#).unwrap();
        fs::write(root.join("alpha/index.js"), b"hello\n").unwrap();
        Self(root)
    }
    fn prepare(&self, state: &mut State) -> io::Result<(usize, Value)> {
        prepare(Prepare { root: self.0.clone(), home: self.0.join("home") }, state)
    }
    fn object(&self, kind: &str, hash: &str, value: &Value) {
        let bytes = serde_json::to_vec(value).unwrap();
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        write!(encoder, "{kind} {hash} {}\0", bytes.len()).unwrap();
        encoder.write_all(&bytes).unwrap();
        fs::create_dir_all(
            self.0
                .join(".bit/objects")
                .join(&hash[..2]),
        )
        .unwrap();
        fs::write(
            self.0
                .join(".bit/objects")
                .join(&hash[..2])
                .join(&hash[2..]),
            encoder.finish().unwrap(),
        )
        .unwrap();
    }
    fn models(&self) {
        let component = crate::validate::hexadecimal(&Sha1::digest(b"test.scope/alpha"));
        let version = "a".repeat(40);
        self.object(
            "Component",
            &component,
            &json!({"name":"alpha","scope":"test.scope","versions":{"1.0.0":version}}),
        );
        self.object("Version", &version, &json!({"mainFile":"index.js","files":[{"name":"index.js","relativePath":"index.js","test":false,
            "file":crate::validate::hexadecimal(&Sha1::digest(b"hello\n"))}],"log":{},"dependencies":[],"devDependencies":[]}));
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn inspect(fixture: &Fixture) -> io::Result<Value> {
    let mut state = State::default();
    fixture.prepare(&mut state)?;
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    let (_, inventory) = scan(&Scan { root_policy: json!({"rules":[]}) }, &mut state, &pool)?;
    assert!(inventory.get("cache").is_none());
    finish(
        &Finish {
            token: inventory["token"].as_u64().unwrap(),
            combined: json!({"rules":[]}),
            hard: json!({"rules":[]}),
            own: json!({"rules":[]}),
            ignored_root: vec![],
        },
        &mut state,
        &pool,
    )?;
    complete(&mut state).map(|(_, value)| value)
}
#[test]
fn models_and_workspace_bytes_are_owned_by_rust() {
    let fixture = Fixture::new();
    fixture.models();
    assert_eq!(
        inspect(&fixture).unwrap(),
        json!({"modified":[],"newComps":[],"compWithIssues":[]}),
    );
    fs::write(fixture.0.join("alpha/index.js"), b"\xef\xbb\xbfhello\r\n").unwrap();
    assert_eq!(inspect(&fixture).unwrap()["modified"], json!([]));
    fs::write(fixture.0.join("alpha/index.js"), b"changed\n").unwrap();
    assert_eq!(inspect(&fixture).unwrap()["modified"], json!(["test.scope/alpha"]));
}
#[test]
fn unsupported_configuration_and_incomplete_plans_cannot_publish() {
    let fixture = Fixture::new();
    let mut state = State::default();
    fixture.prepare(&mut state).unwrap();
    assert!(complete(&mut state).is_err());
    assert!(complete(&mut state).is_err());
    fs::write(fixture.0.join("home/.bitrc.jsonc"), b"{}").unwrap();
    assert!(fixture.prepare(&mut state).is_err());
    fs::remove_file(fixture.0.join("home/.bitrc.jsonc")).unwrap();
    fs::write(fixture.0.join("workspace.jsonc"), br#"{"custom.scope/hook":{}}"#).unwrap();
    assert!(fixture.prepare(&mut state).is_err());
}

#[test]
fn standard_e2e_root_aspects_are_accepted_without_allowing_custom_configuration() {
    let fixture = Fixture::new();
    let mut config = json!({
        "teambit.workspace/workspace":{"defaultScope":"test.scope"},
        "teambit.preview/preview":{"disabled":true},
        "teambit.component/issues":{"ignoreIssues":["MissingManuallyConfiguredPackages"]},
    });
    assert!(super::config::configuration_value(&fixture.0, &config, false).is_ok());
    config["teambit.preview/preview"]["disabled"] = json!(false);
    assert!(super::config::configuration_value(&fixture.0, &config, false).is_err());
    config["teambit.preview/preview"]["disabled"] = json!(true);
    config["teambit.component/issues"]["ignoreIssues"] = json!(["MissingDists"]);
    assert!(super::config::configuration_value(&fixture.0, &config, false).is_err());
}
