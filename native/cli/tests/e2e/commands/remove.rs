//! Local removal against the pinned Node.js CLI.

use crate::helper::Helper;
use std::{ffi::OsStr, fs};

#[test]
fn new_component_removal_matches_node_with_and_without_files() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    let baseline = helper.clone_workspace();
    let bitmap_before = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    for command in ["remove bar/foo --silent --keep-files", "remove bar/foo --silent"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(command);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        assert!(native.status.success());
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
        );
        assert_eq!(
            helper.scopes.local_path.join("bar/foo.js").exists(),
            node_root.join("bar/foo.js").exists(),
        );
        let package = format!("node_modules/@{}/bar.foo", helper.scopes.remote);
        assert_eq!(
            helper.scopes.local_path.join(&package).exists(),
            node_root.join(&package).exists(),
        );
        for root in [&helper.scopes.local_path, &node_root] {
            let metadata =
                fs::read_to_string(root.join(".bit/bitmap-history-metadata.txt")).unwrap();
            let receipt = metadata.lines().last().unwrap();
            let file_id = receipt.strip_suffix(" remove").unwrap();
            assert_eq!(
                fs::read(
                    root.join(".bit/bitmap-history")
                        .join(format!(".bitmap-{file_id}"))
                )
                .unwrap(),
                bitmap_before,
            );
        }
    }
}

#[test]
fn new_component_with_missing_main_file_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    fs::remove_file(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    let node_root = helper.clone_workspace();
    let command = "rm bar/foo --silent";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success());
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    assert_eq!(helper.scopes.local_path.join("bar").exists(), node_root.join("bar").exists());
}

#[test]
fn tagged_removal_matches_node_with_and_without_files() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.run("link");
    helper.run("tag --soft bar/foo --message probe");
    helper.run("tag --persist=skip-build");
    let root = &helper.scopes.local_path;
    let index: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join(".bit/index.json")).unwrap()).unwrap();
    let model_hash = index["components"][0]["hash"].as_str().unwrap();
    let model_wire: String =
        serde_json::from_str(&helper.run(&format!("cat-object {model_hash} -s"))).unwrap();
    let model: serde_json::Value = serde_json::from_str(&model_wire).unwrap();
    let version_hash = model["versions"]["0.0.1"].as_str().unwrap();
    let baseline = helper.clone_workspace();
    for command in [
        "remove bar/foo --silent --force",
        "remove bar/foo --silent --force --keep-files",
        "remove bar/foo --silent",
        "remove bar/foo --silent --keep-files",
    ] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(command);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        assert!(native.status.success());
        for path in [".bitmap", ".bit/index.json", ".bit/staged-config/main.json"] {
            assert_eq!(
                fs::read(root.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
        for hash in [model_hash, version_hash] {
            let object = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
            assert_eq!(root.join(&object).exists(), node_root.join(&object).exists());
            let prefix = format!(".bit/objects/{}", &hash[..2]);
            assert_eq!(root.join(&prefix).exists(), node_root.join(&prefix).exists());
        }
        for path in ["bar/foo.js", "node_modules/@my-scope/bar.foo"] {
            assert_eq!(root.join(path).exists(), node_root.join(path).exists(), "{path}");
        }
    }
}

#[test]
fn removal_of_multiple_local_tags_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'first';");
    helper.add_component_bar_foo();
    helper.run("link");
    helper.run("tag --soft bar/foo --message first");
    helper.run("tag --persist=skip-build");
    helper.output_file("bar/foo.js", "module.exports = 'second';");
    helper.run("tag --soft bar/foo --message second");
    helper.run("tag --persist=skip-build");
    let root = &helper.scopes.local_path;
    let index: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join(".bit/index.json")).unwrap()).unwrap();
    let model_hash = index["components"][0]["hash"].as_str().unwrap();
    let model_wire: String =
        serde_json::from_str(&helper.run(&format!("cat-object {model_hash} -s"))).unwrap();
    let model: serde_json::Value = serde_json::from_str(&model_wire).unwrap();
    let version_hashes = model["versions"]
        .as_object()
        .unwrap()
        .values()
        .map(|value| value.as_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    assert_eq!(version_hashes.len(), 2);
    let baseline = helper.clone_workspace();
    for command in ["remove bar/foo --silent --force", "remove bar/foo --silent"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(command);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        assert!(native.status.success());
        for path in [".bitmap", ".bit/index.json", ".bit/staged-config/main.json"] {
            assert_eq!(
                fs::read(root.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
        for hash in std::iter::once(model_hash).chain(version_hashes.iter().map(String::as_str)) {
            let object = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
            assert_eq!(root.join(&object).exists(), node_root.join(&object).exists());
            let prefix = format!(".bit/objects/{}", &hash[..2]);
            assert_eq!(root.join(&prefix).exists(), node_root.join(&prefix).exists());
        }
        assert_eq!(root.join("bar/foo.js").exists(), node_root.join("bar/foo.js").exists());
    }
}

#[test]
fn tagged_removal_preserves_another_staged_component() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.output_file("baz/qux.js", "module.exports = 'qux';");
    helper.run("add baz -i baz/qux");
    helper.run("link");
    helper.run("tag --soft --message probe");
    helper.run("tag --persist=skip-build");
    let root = &helper.scopes.local_path;
    let index_before: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join(".bit/index.json")).unwrap()).unwrap();
    assert_eq!(
        index_before["components"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    let staged_before: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join(".bit/staged-config/main.json")).unwrap())
            .unwrap();
    assert_eq!(staged_before.as_array().unwrap().len(), 2);
    let baseline = helper.clone_workspace();
    for command in ["remove bar/foo --silent --force", "remove bar/foo --silent"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(command);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        assert!(native.status.success());
        for path in [".bitmap", ".bit/index.json", ".bit/staged-config/main.json"] {
            assert_eq!(
                fs::read(root.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
        assert!(root.join("baz/qux.js").exists());
    }
}

#[test]
fn tagged_missing_main_file_delegates_before_removal() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.run("link");
    helper.run("tag --soft bar/foo --message probe");
    helper.run("tag --persist=skip-build");
    fs::remove_file(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    let node_root = helper.clone_workspace();
    let command = "remove bar/foo --silent --force";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let delegated = helper.cmd(command);
    assert!(!delegated.native, "{}", delegated.trace);
    assert_eq!(delegated.status.code(), node.status.code());
    assert_eq!(delegated.stdout, node.stdout);
    assert_eq!(delegated.stderr, node.stderr);
    assert!(delegated.status.success());
    for path in [".bitmap", ".bit/index.json", ".bit/staged-config/main.json"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(path)).unwrap(),
            fs::read(node_root.join(path)).unwrap(),
            "{path}",
        );
    }
}

#[test]
fn modified_tagged_component_delegates_without_force() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.run("link");
    helper.run("tag --soft bar/foo --message probe");
    helper.run("tag --persist=skip-build");
    helper.output_file("bar/foo.js", "module.exports = 'modified';");
    let node_root = helper.clone_workspace();
    let command = "remove bar/foo --silent";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let delegated = helper.cmd(command);
    assert!(!delegated.native, "{}", delegated.trace);
    assert_eq!(delegated.status.code(), node.status.code());
    assert_eq!(delegated.stdout, node.stdout);
    assert_eq!(delegated.stderr, node.stderr);
    for path in [".bitmap", ".bit/index.json", ".bit/staged-config/main.json", "bar/foo.js"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(path)).unwrap(),
            fs::read(node_root.join(path)).unwrap(),
            "{path}",
        );
    }
}
