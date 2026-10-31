//! `e2e/harmony/untag-harmony.e2e.ts`: published `resetAll()` behavior.

use crate::helper::{Helper, parse};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

fn capture(root: &Path, relative: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
    let path = root.join(relative);
    if path.is_file() {
        files.insert(relative.to_path_buf(), fs::read(path).unwrap());
    } else if path.is_dir() {
        for entry in fs::read_dir(path).unwrap() {
            capture(root, &relative.join(entry.unwrap().file_name()), files);
        }
    }
}

fn workspace_state(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    for relative in [".bitmap", ".bit/index.json", ".bit/objects", "workspace.jsonc", "comp1"] {
        capture(root, Path::new(relative), &mut files);
    }
    files
}

fn remote_state(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    for relative in ["scope.json", "index.json", "objects", ".bit/index.json", ".bit/objects"] {
        capture(root, Path::new(relative), &mut files);
    }
    files
}

fn setup_component(helper: &Helper) {
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = 'v1';");
    helper.run("add comp1");
}

/// Compare the actual `resetAll()` command and its complete modeled inventory with released Node.
fn reset_all(helper: &Helper) -> Value {
    let node_root = helper.clone_workspace();
    let remote_before = remote_state(&helper.scopes.remote_path);
    let command = "reset --silent";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success(), "{}", native.stderr);
    assert_eq!(workspace_state(&helper.scopes.local_path), workspace_state(&node_root));
    assert_eq!(remote_state(&helper.scopes.remote_path), remote_before);
    let native_status = helper.native_run("status --json");
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(native_status.status.success(), "{}", native_status.stderr);
    assert_eq!(native_status.status.code(), node_status.status.code());
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
    parse(&native_status.stdout)
}

fn bitmap_version(helper: &Helper) -> String {
    let text = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    let bitmap = parse(&text[text.find('{').unwrap()..]);
    bitmap["comp1"]["version"]
        .as_str()
        .unwrap()
        .to_string()
}

/// An exported model may retain an old tag whose Version object is absent locally.
#[test]
fn missing_old_exported_version_object_does_not_block_reset_all() {
    let helper = Helper::new();
    setup_component(&helper);
    helper.tag_without_build("", "--message first");
    let model = parse(&helper.run("cat-component comp1 --json"));
    let old = model["versions"]["0.0.1"].as_str().unwrap();
    helper.output_file("comp1/index.js", "module.exports = 'v2';");
    helper.tag_without_build("", "--message second");
    helper.run("export");
    helper.output_file("comp1/index.js", "module.exports = 'v3';");
    helper.tag_without_build("", "--message third");
    fs::remove_file(helper.scopes.local_path.join(format!(
        ".bit/objects/{}/{}",
        &old[..2],
        &old[2..],
    )))
    .unwrap();
    reset_all(&helper);
}

/// Two unexported tags reset to only a new component, with no staged or snapped head.
#[test]
fn multiple_local_tags_reset_to_new_only() {
    let helper = Helper::new();
    setup_component(&helper);
    helper.tag_without_build("", "--message first");
    helper.tag_without_build("", "--unmodified --message second");
    let status = reset_all(&helper);
    assert_eq!(
        status["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
        "{status}",
    );
    for key in ["stagedComponents", "snappedComponents", "modifiedComponents"] {
        assert!(
            status[key]
                .as_array()
                .unwrap()
                .is_empty(),
            "{key}: {status}",
        );
    }
}

/// Resetting two local tags after an exported first tag is clean and keeps its bitmap semver.
#[test]
fn exported_boundary_resets_to_clean_status_and_semver_bitmap() {
    let helper = Helper::new();
    setup_component(&helper);
    helper.tag_without_build("", "--message first");
    helper.run("export");
    helper.tag_without_build("", "--unmodified --message second");
    helper.tag_without_build("", "--unmodified --message third");
    let status = reset_all(&helper);
    for key in ["newComponents", "stagedComponents", "snappedComponents", "modifiedComponents"] {
        assert!(
            status[key]
                .as_array()
                .unwrap()
                .is_empty(),
            "{key}: {status}",
        );
    }
    assert_eq!(bitmap_version(&helper), "0.0.1");
}
