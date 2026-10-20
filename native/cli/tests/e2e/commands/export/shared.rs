//! Public export into an actual Unix shared-group file scope.
use crate::helper::{Helper, parse};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs,
    io::Read,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

fn clock() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
}

fn decoded(path: &Path, compressed: &[u8]) -> (String, Value) {
    let mut raw = Vec::new();
    flate2::read::ZlibDecoder::new(compressed).read_to_end(&mut raw).unwrap();
    let boundary = raw
        .iter()
        .position(|byte| *byte == 0)
        .unwrap();
    let (header, rest) = raw.split_at(boundary);
    let body = &rest[1..];
    let header = std::str::from_utf8(header).unwrap();
    let mut fields = header.split(' ');
    let kind = fields.next().unwrap();
    let hash = fields.next().unwrap();
    let length: usize = fields.next().unwrap().parse().unwrap();
    assert_eq!(
        hash,
        format!(
            "{}{}",
            path.parent()
                .unwrap()
                .file_name()
                .unwrap()
                .to_string_lossy(),
            path.file_name()
                .unwrap()
                .to_string_lossy()
        ),
    );
    assert_eq!(length, String::from_utf8_lossy(body).encode_utf16().count());
    assert!(fields.next().is_none());
    let value: Value = serde_json::from_slice(body).unwrap();
    if kind == "Component" {
        let id =
            format!("{}/{}", value["scope"].as_str().unwrap(), value["name"].as_str().unwrap());
        assert_eq!(hash, format!("{:x}", Sha1::digest(id.as_bytes())));
    }
    (kind.to_owned(), value)
}

fn normalized_clock(left: &mut Value, right: &mut Value, node: (u128, u128), rust: (u128, u128)) {
    for key in ["remotes", "scopeList", "scopesList"] {
        let (Some(node_rows), Some(rust_rows)) =
            (left[key].as_array_mut(), right[key].as_array_mut())
        else {
            continue;
        };
        assert_eq!(node_rows.len(), rust_rows.len());
        for (node_row, rust_row) in node_rows.iter_mut().zip(rust_rows) {
            normalize_row_dates(node_row, rust_row, node, rust);
        }
    }
}

fn normalize_row_dates(
    node_row: &mut Value,
    rust_row: &mut Value,
    node: (u128, u128),
    rust: (u128, u128),
) {
    if node_row["date"] == rust_row["date"] {
        return;
    }
    for (row, window) in [(&*node_row, node), (&*rust_row, rust)] {
        let date: u128 = row["date"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();
        assert!(date >= window.0 && date <= window.1, "unexpected export date {date}");
    }
    node_row["date"] = serde_json::json!("<export-clock>");
    rust_row["date"] = serde_json::json!("<export-clock>");
}

fn compare_objects(
    node: &BTreeMap<PathBuf, (Vec<u8>, u32, u32, u32)>,
    rust: &BTreeMap<PathBuf, (Vec<u8>, u32, u32, u32)>,
    node_window: (u128, u128),
    rust_window: (u128, u128),
) {
    assert_eq!(node.keys().collect::<Vec<_>>(), rust.keys().collect::<Vec<_>>());
    for (path, (node_raw, node_mode, node_uid, node_gid)) in node {
        let (rust_raw, rust_mode, rust_uid, rust_gid) = &rust[path];
        assert_eq!((node_mode, node_uid, node_gid), (rust_mode, rust_uid, rust_gid), "{path:?}");
        if node_raw == rust_raw {
            continue;
        }
        let (node_kind, mut node_value) = decoded(path, node_raw);
        let (rust_kind, mut rust_value) = decoded(path, rust_raw);
        assert_eq!(node_kind, rust_kind, "{path:?}");
        assert_eq!(node_kind, "Component", "unexpected raw object difference: {path:?}");
        normalized_clock(&mut node_value, &mut rust_value, node_window, rust_window);
        assert_eq!(node_value, rust_value, "{path:?}");
    }
}

fn objects(root: &Path) -> BTreeMap<PathBuf, (Vec<u8>, u32, u32, u32)> {
    let mut objects = BTreeMap::new();
    for prefix in fs::read_dir(root.join("objects")).unwrap() {
        let prefix = prefix.unwrap().path();
        if !prefix.is_dir() {
            continue;
        }
        for file in fs::read_dir(prefix).unwrap() {
            let file = file.unwrap().path();
            let metadata = fs::metadata(&file).unwrap();
            objects.insert(
                file.strip_prefix(root)
                    .unwrap()
                    .to_owned(),
                (fs::read(&file).unwrap(), metadata.mode(), metadata.uid(), metadata.gid()),
            );
        }
    }
    objects
}

#[test]
fn shared_group_export_matches_released_objects_permissions_and_output() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("bar/index.js", "module.exports = 'shared';");
    helper.run("add bar");
    helper.run("tag --message shared");
    let group = Command::new("id")
        .arg("-gn")
        .output()
        .unwrap();
    assert!(group.status.success());
    let group = String::from_utf8(group.stdout).unwrap();
    let scope_path = helper.scopes.remote_path.join("scope.json");
    let mut scope = parse(&fs::read_to_string(&scope_path).unwrap());
    scope["groupName"] = serde_json::json!(group.trim());
    fs::write(&scope_path, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
    let before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node_start = clock();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    let node_end = clock();
    assert!(node.status.success(), "{node:?}");
    let node_objects = objects(&helper.scopes.remote_path);
    let node_index =
        parse(&fs::read_to_string(helper.scopes.remote_path.join("index.json")).unwrap());
    helper.restore_remote_scope(&before);
    let rust_start = clock();
    let native = helper.native_run("export");
    let rust_end = clock();
    assert!(native.native && native.status.success(), "{native:?}");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    compare_objects(
        &node_objects,
        &objects(&helper.scopes.remote_path),
        (node_start, node_end),
        (rust_start, rust_end),
    );
    assert_eq!(
        parse(&fs::read_to_string(helper.scopes.remote_path.join("index.json")).unwrap()),
        node_index,
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
}
