//! Saved graph adjacency remains usable without optional external model metadata.

use crate::helper::{
    Helper,
    config::{read_jsonc, write_json},
    parse,
};
use sha1::{Digest, Sha1};
use std::{ffi::OsStr, fs};

#[test]
fn missing_external_model_uses_saved_adjacency_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = read_jsonc(&bitmap_path);
    bitmap
        .as_object_mut()
        .unwrap()
        .retain(|_, row| row["name"] != "comp2");
    write_json(&bitmap_path, &bitmap, b"    ");
    let identity = format!("{}/comp2", helper.scopes.remote);
    let hash = format!("{:x}", Sha1::digest(identity.as_bytes()));
    let relative = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
    let path = helper.scopes.local_path.join(&relative);
    fs::remove_file(&path).unwrap();
    let index_path = helper.scopes.local_path.join(".bit/index.json");
    let mut index = read_jsonc(&index_path);
    index["components"]
        .as_array_mut()
        .unwrap()
        .retain(|row| row["id"]["name"] != "comp2");
    write_json(&index_path, &index, b"  ");
    let copy = helper.clone_workspace();
    let oracle = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "status --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(oracle.status.success(), "{}", oracle.stderr);
    assert!(!path.exists(), "Node uses saved adjacency without fetching the model");
    helper.get_cloned_workspace(&copy);
    let native = helper.native_run("status --json");
    assert_eq!(native.status.code(), oracle.status.code());
    assert_eq!(parse(&native.stdout), parse(&oracle.stdout));
    assert!(!path.exists(), "native also leaves the optional model absent");
}
