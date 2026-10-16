//! New snapshots recreate an unlinked component package and source links.

mod application;
mod sources;
mod unmerged;

use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use std::{ffi::OsStr, fs, path::Path};

fn compare(root: &Path, node_root: &Path, package_name: &str, file: &str) -> (String, String) {
    let package = |root: &Path| {
        fs::read_to_string(
            root.join("node_modules")
                .join(package_name)
                .join("package.json"),
        )
        .unwrap()
    };
    let native_text = package(root);
    let node_text = package(node_root);
    let native_package = parse(&native_text);
    let node_package = parse(&node_text);
    let native_hash = native_package["componentId"]["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let node_hash = node_package["componentId"]["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let normalize =
        |value: &serde_json::Value, hash: &str| value.to_string().replace(hash, "SNAP_HASH");
    assert_eq!(
        native_text.replace(&native_hash, "SNAP_HASH"),
        node_text.replace(&node_hash, "SNAP_HASH"),
    );
    let source = |root: &Path| {
        root.join("node_modules")
            .join(package_name)
            .join(file)
    };
    assert_eq!(fs::read(source(root)).unwrap(), fs::read(source(node_root)).unwrap());
    #[cfg(unix)]
    assert!(
        fs::symlink_metadata(source(root))
            .unwrap()
            .file_type()
            .is_symlink(),
    );
    assert_eq!(
        normalize(&config::read_jsonc(&root.join(".bitmap")), &native_hash),
        normalize(&config::read_jsonc(&node_root.join(".bitmap")), &node_hash),
    );
    (native_hash, node_hash)
}

#[test]
fn snap_new_unlinked_component_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.delete_path("node_modules/@my-scope/bar.foo");
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "snap --message first",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("snap --message first");
    assert_eq!(native.status.code(), node.status.code());
    let (native_hash, node_hash) =
        compare(&helper.scopes.local_path, &node_root, "@my-scope/bar.foo", "foo.js");
    assert_eq!(
        native.stdout.replace(&native_hash, "SNAP_HASH"),
        node.stdout.replace(&node_hash, "SNAP_HASH"),
    );
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn snap_existing_component_without_generated_package_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("snap --message first");
    helper.delete_path("node_modules/@my-scope/bar.foo");
    helper.append_file("bar/foo.js", "\n// second snapshot");
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "snap --message second",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("snap --message second");
    assert_eq!(native.status.code(), node.status.code());
    let (native_hash, node_hash) =
        compare(&helper.scopes.local_path, &node_root, "@my-scope/bar.foo", "foo.js");
    assert_eq!(
        native.stdout.replace(&native_hash, "SNAP_HASH"),
        node.stdout.replace(&node_hash, "SNAP_HASH"),
    );
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn snap_recreates_package_with_injected_root_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(1, true, "");
    let injected = helper.scopes.local_path.join(
        "node_modules/.bit_roots/teambit.harmony_node/node_modules/@my-scope/comp1",
    );
    assert!(injected.is_dir(), "injected component package is absent");
    helper.run("snap --message first");
    helper.delete_path("node_modules/@my-scope/comp1");
    helper.append_file("comp1/index.js", "\n// second snapshot");
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "snap --message second",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("snap --message second");
    assert_eq!(native.status.code(), node.status.code());
    let (native_hash, node_hash) =
        compare(&helper.scopes.local_path, &node_root, "@my-scope/comp1", "index.js");
    assert_eq!(
        native.stdout.replace(&native_hash, "SNAP_HASH"),
        node.stdout.replace(&node_hash, "SNAP_HASH"),
    );
    assert_eq!(native.stderr, node.stderr);
    let injected_file = |root: &Path| {
        root.join(
            "node_modules/.bit_roots/teambit.harmony_node/node_modules/@my-scope/comp1/index.js",
        )
    };
    assert_eq!(
        fs::read(injected_file(&helper.scopes.local_path)).unwrap(),
        fs::read(injected_file(&node_root)).unwrap(),
    );
}

#[test]
fn snap_local_build_publishes_native_objects_after_the_builder() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    let node_root = helper.clone_workspace();
    let command = "snap --build --skip-tests --disable-snap-pipeline --message built";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert_eq!(
        native.status.code(),
        node.status.code(),
        "native: {} {}\nnode: {} {}",
        native.stdout,
        native.stderr,
        node.stdout,
        node.stderr,
    );
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    let (native_hash, node_hash) =
        compare(&helper.scopes.local_path, &node_root, "@my-scope/bar.foo", "foo.js");
    assert_eq!(
        normalize_build_output(&native.stdout, &native_hash),
        normalize_build_output(&node.stdout, &node_hash),
    );
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn snap_modified_state_selector_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag --message initial");
    helper.append_file("bar/foo.js", "\n// selected change");
    let node_root = helper.clone_workspace();
    let command = r#"snap "$modified AND bar/*" --message selected"#;
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code());
    let (native_hash, node_hash) =
        compare(&helper.scopes.local_path, &node_root, "@my-scope/bar.foo", "foo.js");
    assert_eq!(
        native.stdout.replace(&native_hash, "SNAP_HASH"),
        node.stdout.replace(&node_hash, "SNAP_HASH"),
    );
    assert_eq!(native.stderr, node.stderr);
}

fn normalize_build_output(output: &str, hash: &str) -> String {
    output
        .replace(hash, "SNAP_HASH")
        .lines()
        .map(|line| {
            for marker in ["Succeeded in ", "Completed successfully in "] {
                if let Some((prefix, _)) = line.split_once(marker) {
                    return format!("{prefix}{marker}DURATION");
                }
            }
            line.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}
