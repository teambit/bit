use super::{Prepare, load_models};
use serde_json::{Value, json};
use std::{io::Write, path::Path};

#[test]
fn lane_model_loading_does_not_require_unrelated_main_version() {
    let root = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let objects = root.0.join(".bit/objects");
    std::fs::create_dir_all(&objects).unwrap();
    let missing = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let current = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let hash = crate::workspace::engine::hash(b"scope/component");
    std::fs::write(root.0.join(".bit/scope.json"), br#"{"name":"scope","remotes":{}}"#).unwrap();
    std::fs::write(root.0.join(".bit/index.json"),serde_json::to_vec(&json!({"components":[{"id":{"scope":"scope","name":"component"},"hash":hash,"isSymlink":false}],"lanes":[]})).unwrap()).unwrap();
    object(
        &objects,
        &hash,
        "Component",
        &json!({"scope":"scope","name":"component","head":missing,"versions":{"1.0.0":missing},"lang":"javascript","bindingPrefix":"@scope","remotes":[]}),
    );
    object(
        &objects,
        current,
        "Version",
        &json!({"schema":"2.0.0","mainFile":"index.js","files":[],"dependencies":[],"devDependencies":[],"peerDependencies":[],"packageDependencies":{},"devPackageDependencies":{},"peerPackageDependencies":{},"extensions":[],"flattenedDependencies":[],"log":{"date":"1","message":""},"parents":[]}),
    );
    let request:Prepare=serde_json::from_value(json!({"root":root.0,"home":root.0.join("home"),"globalRemotesFile":root.0.join("remotes.json"),"options":{}})).unwrap();
    let imported =
        crate::command_import::prepare_lane(&request.root, &request.global_remotes_file).unwrap();
    let mut context = json!({"targets":[{"identity":"scope/component","version":current}],"lane":{"targets":[{"identity":"scope/component","head":current}]}});
    load_models(
        &request,
        &rayon::ThreadPoolBuilder::new()
            .num_threads(2)
            .build()
            .unwrap(),
        &mut context,
        &imported,
    )
    .unwrap();
    assert_eq!(context["models"][0]["head"], missing);
    assert_eq!(
        context["versions"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(context["versions"][0][0], current);
    assert!(
        !objects
            .join(&missing[..2])
            .join(&missing[2..])
            .exists(),
    );
}
fn object(directory: &Path, hash: &str, kind: &str, value: &Value) {
    let body = serde_json::to_vec(&value).unwrap();
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    encoder
        .write_all(format!("{kind} {hash} {}\0", body.len()).as_bytes())
        .unwrap();
    encoder.write_all(&body).unwrap();
    let path = directory
        .join(&hash[..2])
        .join(&hash[2..]);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, encoder.finish().unwrap()).unwrap();
}
