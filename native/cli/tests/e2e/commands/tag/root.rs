//! A changed workspace-root joins members without inheriting their release request.

use super::soft::{bitmap, compare_command};
use crate::helper::{Helper, parse};
use std::ffi::OsStr;

fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(1, true, "");
    helper.output_file("README.md", "# root first\n");
    helper.run("add . -i ws-root --root");
    let setup = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "tag --ignore-issues * --message initial",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(setup.status.success(), "{} {}", setup.stdout, setup.stderr);
    helper
}

fn provenance(helper: &Helper, component: &str) -> serde_json::Value {
    let component = parse(&helper.run(&format!("cat-component {component}@latest --json")));
    component["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|extension| extension["name"] == "teambit.workspace/workspace-root")
        .unwrap()["data"]
        .clone()
}

#[test]
fn explicit_member_version_brings_modified_root_with_its_own_patch() {
    let helper = workspace();
    helper.output_file("README.md", "# root second\n");
    helper.append_file("comp1/index.js", "\n// member second");
    let node_workspace = helper.clone_workspace();
    compare_command(
        &helper,
        &node_workspace,
        "tag comp1 --ver 1.0.0 --ignore-issues * --message second",
    );
    let actual = bitmap(&helper.scopes.local_path);
    assert_eq!(actual["comp1"]["version"], "1.0.0");
    assert_eq!(actual["ws-root"]["version"], "0.0.2");
    assert_eq!(provenance(&helper, "comp1")["root"], "my-scope/ws-root@0.0.2");
    assert_eq!(provenance(&helper, "ws-root"), serde_json::json!({"isRoot":true}));
    assert_root_sources(&helper, &node_workspace);
    helper.append_file("comp1/index.js", "\n// member third");
    let node_workspace = helper.clone_workspace();
    compare_command(&helper, &node_workspace, "tag comp1 --ignore-issues * --message third");
    assert_eq!(bitmap(&helper.scopes.local_path)["ws-root"]["version"], "0.0.2");
}

fn assert_root_sources(helper: &Helper, node_workspace: &std::path::Path) {
    let root_version = parse(&helper.run("cat-component ws-root@latest --json"));
    let root_files = root_version["files"].as_array().unwrap();
    assert!(
        !root_files
            .iter()
            .any(|file| {
                file["relativePath"]
                    .as_str()
                    .unwrap()
                    .starts_with("comp1/")
            }),
    );
    let oracle = Helper::cmd_in_with(
        node_workspace,
        "cat-component ws-root@latest --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let oracle = parse(&oracle.stdout);
    let bitmap_hash = |component: &serde_json::Value| {
        component["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|file| file["relativePath"] == ".bitmap")
            .unwrap()["file"]
            .clone()
    };
    assert_eq!(bitmap_hash(&root_version), bitmap_hash(&oracle));
}

#[test]
fn modified_root_snap_records_allocated_hash_without_package_materialization() {
    let helper = workspace();
    helper.output_file("README.md", "# changed root\n");
    helper.append_file("comp1/index.js", "\n// snap member");
    let node_workspace = helper.clone_workspace();
    let command = "snap comp1 --ignore-issues * --message root-snap";
    let native = helper.native_run(command);
    let node = Helper::cmd_in_with(&node_workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    let actual = bitmap(&helper.scopes.local_path);
    let expected = bitmap(&node_workspace);
    let mut native_text = native.stdout;
    let mut node_text = node.stdout;
    for component in ["comp1", "ws-root"] {
        let marker = format!("HASH_{component}");
        native_text = native_text.replace(actual[component]["version"].as_str().unwrap(), &marker);
        node_text = node_text.replace(expected[component]["version"].as_str().unwrap(), &marker);
    }
    assert_eq!(native_text, node_text);
    let root = actual["ws-root"]["version"].as_str().unwrap();
    assert_eq!(provenance(&helper, "comp1")["root"], format!("my-scope/ws-root@{root}"));
    assert!(!helper.scopes.local_path.join("node_modules/@my-scope/ws-root").exists());
    assert_root_sources(&helper, &node_workspace);
}

#[test]
fn versions_file_default_does_not_override_automatic_root_patch() {
    let helper = workspace();
    helper.output_file("README.md", "# root version file\n");
    helper.append_file("comp1/index.js", "\n// version file member");
    helper.output_file("versions.txt", "DEFAULT: minor\nmy-scope/comp1: 1.0.0\n");
    let node_workspace = helper.clone_workspace();
    compare_command(
        &helper,
        &node_workspace,
        "tag comp1 --versions-file versions.txt --ignore-issues * --message root-file",
    );
    let actual = bitmap(&helper.scopes.local_path);
    assert_eq!(actual["comp1"]["version"], "1.0.0");
    assert_eq!(actual["ws-root"]["version"], "0.0.2");
}
