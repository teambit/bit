//! `e2e/harmony/revert.e2e.ts`.

use crate::{
    harmony::lane_adoption::output::durations,
    helper::{Helper, parse},
    known_failure::Native,
};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

/// `bitMap.read()`: `.bitmap` without its leading comment.
fn read_bitmap(helper: &Helper) -> Value {
    let text = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    crate::helper::parse(&text[text.find('{').unwrap()..])
}

/// `fs.readFile(path)`.
fn read_file(helper: &Helper, relative: &str) -> String {
    fs::read_to_string(helper.scopes.local_path.join(relative)).unwrap()
}

/// basic revert: comp1 tagged twice, the second time with `version2`.
fn tagged_twice() -> (Helper, std::path::PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.run("tag");
    helper.populate_components(1, false, "version2");
    helper.run("tag");
    let before_revert = helper.clone_workspace();
    (helper, before_revert)
}

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

fn modeled_state(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    for relative in [
        ".bitmap",
        ".bit/index.json",
        ".bit/objects",
        ".bit/refs",
        ".bit/scope.json",
        ".bit/staged-snaps",
        "workspace.jsonc",
        "comp1",
    ] {
        capture(root, Path::new(relative), &mut files);
    }
    files
}

fn revert_against_node(helper: &Helper) {
    let command = "revert comp1 0.0.1 -x";
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(durations(&native.stdout), durations(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success(), "{}", native.stderr);
    assert_eq!(modeled_state(&helper.scopes.local_path), modeled_state(&node_root));
    let native_status = helper.native_run("status --json");
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native_status.status.code(), node_status.status.code());
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

/// revert from lane to main › should change the code according to main; should keep the
/// versions intact
#[test]
fn revert_from_a_lane_to_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag");
    crate::helper::remote::publish(&helper);
    helper.run("lane create lane-a");
    helper.populate_components(2, true, "version2");
    helper.run("snap");
    crate::helper::remote::publish(&helper);
    helper.native_output_or_known(r#"revert "**" main"#).native();
    for comp in ["comp1", "comp2"] {
        assert!(!read_file(&helper, &format!("{comp}/index.js")).contains("version2"));
        assert_ne!(read_bitmap(&helper)[comp]["version"], "0.0.1");
    }
}

/// Basic revert writes an older local tag's files and retains the bitmap version.
#[test]
fn revert_changes_the_code_and_keeps_the_version() {
    let (helper, _) = tagged_twice();
    revert_against_node(&helper);
    assert!(!read_file(&helper, "comp1/index.js").contains("version2"));
    assert_eq!(read_bitmap(&helper)["comp1"]["version"], "0.0.2");
}

/// Revert replaces workspace edits with the selected local Version.
#[test]
fn revert_overrides_a_modified_component() {
    let (helper, before_revert) = tagged_twice();
    revert_against_node(&helper);
    helper.get_cloned_workspace(&before_revert);
    helper.populate_components(1, false, "version3");
    revert_against_node(&helper);
    let content = read_file(&helper, "comp1/index.js");
    assert!(!content.contains("version2"), "{content}");
    assert!(!content.contains("version3"), "{content}");
}
