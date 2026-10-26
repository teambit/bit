use crate::lane_create::{Options, Plan, outbound};
use serde_json::{Value, json};
use std::{fs, path::Path};

const MODEL: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FIRST: &str = "1111111111111111111111111111111111111111";
const SECOND: &str = "2222222222222222222222222222222222222222";
const LANE: &str = "dddddddddddddddddddddddddddddddddddddddd";

fn fixture(exported: bool) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    fs::create_dir_all(root.join(".bit/objects")).unwrap();
    fs::write(root.join(".bitmap"), serde_json::to_vec(&json!({
        "$schema-version":"17.0.0","alpha":{"name":"alpha","scope":"scope","version":SECOND,"rootDir":"alpha","mainFile":"index.js"},
    })).unwrap()).unwrap();
    fs::write(
        root.join(".bit/index.json"),
        serde_json::to_vec(&json!({
            "components":[{"id":{"scope":"scope","name":"alpha"},"hash":MODEL}],"lanes":[],
        }))
        .unwrap(),
    )
    .unwrap();
    fs::write(
        root.join(".bit/scope.json"),
        serde_json::to_vec(&json!({
            "name":"scope","lanes":{"current":"main","tracking":[],"new":[]},
        }))
        .unwrap(),
    )
    .unwrap();
    put(root, FIRST, "Version", &json!({"mainFile":"index.js","files":[],"log":{},"parents":[]}));
    put(
        root,
        SECOND,
        "Version",
        &json!({"mainFile":"index.js","files":[],"log":{},"parents":[FIRST]}),
    );
    put(
        root,
        MODEL,
        "Component",
        &json!({"scope":"scope","name":"alpha","head":SECOND,"versions":{},"state":{"versions":{SECOND:{"local":true}}}}),
    );
    if exported {
        fs::create_dir_all(root.join(".bit/refs/remotes/scope")).unwrap();
        fs::write(
            root.join(".bit/refs/remotes/scope/main"),
            serde_json::to_vec(&json!([
                {"id":{"scope":"scope","name":"alpha"},"head":FIRST},
            ]))
            .unwrap(),
        )
        .unwrap();
    }
    dir
}

fn put(root: &Path, hash: &str, kind: &str, value: &Value) {
    let directory = root
        .join(".bit/objects")
        .join(&hash[..2]);
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join(&hash[2..]), outbound::encode_object(hash, kind, value).unwrap())
        .unwrap();
}
fn read(root: &Path, hash: &str, kind: &str) -> Value {
    outbound::read_object(&root.join(".bit/objects"), hash, kind).unwrap()
}
fn plan(root: &Path) -> std::io::Result<Plan> {
    Plan::prepare(
        root,
        "dev",
        "scope",
        Options { alias: "dev", fork_lane_new_scope: false },
        json!({"date":"1"}),
        LANE,
        "history",
    )
}

#[test]
fn moves_main_snaps_and_restores_the_remote_head() {
    let dir = fixture(true);
    plan(dir.path())
        .unwrap()
        .commit()
        .unwrap();
    let model = read(dir.path(), MODEL, "Component");
    assert_eq!(model["head"], FIRST);
    assert_eq!(model["state"]["versions"], json!({}));
    assert_eq!(read(dir.path(), LANE, "Lane")["components"][0]["head"], SECOND);
    assert_eq!(read(dir.path(), SECOND, "Version")["origin"]["lane"]["hash"], LANE);
    assert!(read(dir.path(), FIRST, "Version").get("origin").is_none());
}

#[test]
fn a_new_component_loses_its_main_head_and_preserves_existing_lane_origins() {
    let dir = fixture(false);
    let mut first = read(dir.path(), FIRST, "Version");
    first["origin"] = json!({"id":{"scope":"scope","name":"alpha"},"lane":{"scope":"scope","name":"old","hash":MODEL}});
    put(dir.path(), FIRST, "Version", &first);
    plan(dir.path())
        .unwrap()
        .commit()
        .unwrap();
    assert!(read(dir.path(), MODEL, "Component").get("head").is_none());
    assert_eq!(read(dir.path(), FIRST, "Version"), first);
}

#[test]
fn rejects_tags_and_outdated_workspaces_before_writing() {
    for tagged in [true, false] {
        let dir = fixture(true);
        let mut model = read(dir.path(), MODEL, "Component");
        if tagged {
            model["versions"] = json!({"1.0.0":SECOND});
            put(dir.path(), MODEL, "Component", &model);
        } else {
            let path = dir.path().join(".bitmap");
            let mut bitmap: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            bitmap["alpha"]["version"] = json!(FIRST);
            fs::write(path, serde_json::to_vec(&bitmap).unwrap()).unwrap();
        }
        assert!(plan(dir.path()).is_err());
        assert_eq!(read(dir.path(), MODEL, "Component"), model);
    }
}

#[test]
fn changed_sources_abort_before_publishing_the_lane() {
    let dir = fixture(true);
    let prepared = plan(dir.path()).unwrap();
    let mut version = read(dir.path(), SECOND, "Version");
    version["log"] = json!({"message":"concurrent update"});
    put(dir.path(), SECOND, "Version", &version);
    assert!(prepared.commit().is_err());
    assert!(
        !dir.path()
            .join(".bit/objects/dd")
            .join(&LANE[2..])
            .exists(),
    );
    assert_eq!(read(dir.path(), MODEL, "Component")["head"], SECOND);
}
