//! Local removal against the pinned Node.js CLI.
mod completion;
mod selectors;
mod suite;

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
    // These identities share the object-prefix directory, making the status history observable.
    crate::helper::config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        serde_json::json!("remove-scope-178"),
    );
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
        let history = ".bit/objects/f5/54826d98f13cd7367a27793484ab385faa450e";
        assert_eq!(fs::read(root.join(history)).ok(), fs::read(node_root.join(history)).ok());
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
    assert!(delegated.native, "{}", delegated.trace);
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
    assert!(delegated.native, "{}", delegated.trace);
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

#[test]
fn clean_imported_removal_matches_node_with_force_and_keep_files() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    let root = &helper.scopes.local_path;
    let index: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join(".bit/index.json")).unwrap()).unwrap();
    let model_hash = index["components"][0]["hash"].as_str().unwrap();
    let model_wire: String =
        serde_json::from_str(&helper.run(&format!("cat-object {model_hash} -s"))).unwrap();
    let model: serde_json::Value = serde_json::from_str(&model_wire).unwrap();
    let version_hash = model["versions"]["0.0.1"].as_str().unwrap();
    let baseline = helper.clone_workspace();
    for suffix in ["", " --force", " --keep-files"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("remove {}/bar/foo --silent{suffix}", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(&command);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        assert!(native.status.success());
        for path in [".bitmap", ".bit/index.json"] {
            assert_eq!(
                fs::read(root.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
        for hash in [model_hash, version_hash] {
            let object = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
            assert_eq!(root.join(&object).exists(), node_root.join(&object).exists());
        }
        let files = format!("{}/bar/foo/foo.js", helper.scopes.remote);
        assert_eq!(root.join(&files).exists(), node_root.join(&files).exists());
    }
}

#[test]
fn imported_package_removal_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo", helper.scopes.remote));
    let root = &helper.scopes.local_path;
    let package = format!("node_modules/@{}/bar.foo", helper.scopes.remote);
    assert!(root.join(&package).exists());
    let node_root = helper.clone_workspace();
    let command = format!("remove {}/bar/foo --silent", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success());
    assert_eq!(root.join(&package).exists(), node_root.join(&package).exists());
    for path in [".bitmap", ".bit/index.json"] {
        assert_eq!(
            fs::read(root.join(path)).unwrap(),
            fs::read(node_root.join(path)).unwrap(),
            "{path}",
        );
    }
}

#[test]
fn modified_imported_component_delegates_unless_forced() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    let files = format!("{}/bar/foo/foo.js", helper.scopes.remote);
    helper.output_file(&files, "module.exports = 'changed';");
    let baseline = helper.clone_workspace();
    for (suffix, native_expected) in [("", true), (" --force", true)] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("remove {}/bar/foo --silent{suffix}", helper.scopes.remote);
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let actual = helper.cmd(&command);
        assert_eq!(actual.native, native_expected, "{}", actual.trace);
        assert_eq!(actual.status.code(), node.status.code());
        assert_eq!(actual.stdout, node.stdout);
        assert_eq!(actual.stderr, node.stderr);
        for path in [".bitmap", ".bit/index.json"] {
            assert_eq!(
                fs::read(helper.scopes.local_path.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
        assert_eq!(helper.scopes.local_path.join(&files).exists(), node_root.join(&files).exists());
    }
}

#[test]
fn new_component_on_lane_removal_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = 'lane';");
    helper.add_component_bar_foo();
    let baseline = helper.clone_workspace();
    for suffix in ["", " --keep-files"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("remove bar/foo --silent{suffix}");
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(&command);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        for path in [".bitmap", ".bit/index.json"] {
            assert_eq!(
                fs::read(helper.scopes.local_path.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
        assert_eq!(
            helper.scopes.local_path.join("bar/foo.js").exists(),
            node_root.join("bar/foo.js").exists(),
        );
    }
}

#[test]
fn snapped_component_on_lane_removal_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = 'lane';");
    helper.add_component_bar_foo();
    helper.run("snap --message lane");
    let baseline = helper.clone_workspace();
    for suffix in ["", " --force", " --keep-files"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("remove bar/foo --silent{suffix}");
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(&command);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        let root = &helper.scopes.local_path;
        for path in [".bitmap", ".bit/index.json", ".bit/staged-config/my-scope/dev.json"] {
            assert_eq!(
                fs::read(root.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
        let index: serde_json::Value =
            serde_json::from_slice(&fs::read(baseline.join(".bit/index.json")).unwrap()).unwrap();
        let lane_hash = index["lanes"][0]["hash"].as_str().unwrap();
        let model_hash = index["components"][0]["hash"].as_str().unwrap();
        for hash in [lane_hash, model_hash] {
            let path = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
            assert_eq!(
                fs::read(root.join(&path)).ok(),
                fs::read(node_root.join(&path)).ok(),
                "{hash}",
            );
        }
        let native_objects = scope_objects(root);
        let node_objects = scope_objects(&node_root);
        assert_eq!(
            native_objects.keys().collect::<Vec<_>>(),
            node_objects.keys().collect::<Vec<_>>(),
            "{suffix}",
        );
        for (path, bytes) in native_objects {
            assert!(bytes == node_objects[&path], "{path:?}");
        }
        assert_eq!(root.join("bar/foo.js").exists(), node_root.join("bar/foo.js").exists());
    }
}

pub(super) fn scope_objects(
    root: &std::path::Path,
) -> std::collections::BTreeMap<std::path::PathBuf, Vec<u8>> {
    let base = bit_object_import::scope_path(root).join("objects");
    let mut pending = vec![base.clone()];
    let mut objects = std::collections::BTreeMap::new();
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(directory).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else {
                objects.insert(
                    path.strip_prefix(&base)
                        .unwrap()
                        .to_owned(),
                    fs::read(path).unwrap(),
                );
            }
        }
    }
    objects
}

#[test]
fn modified_lane_component_delegates_unless_forced() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = 'lane';");
    helper.add_component_bar_foo();
    helper.run("snap --message lane");
    helper.output_file("bar/foo.js", "module.exports = 'modified';");
    let baseline = helper.clone_workspace();
    for (suffix, native_expected) in [("", true), (" --force", true)] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("remove bar/foo --silent{suffix}");
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let actual = helper.cmd(&command);
        assert_eq!(actual.native, native_expected, "{}", actual.trace);
        assert_eq!(actual.status.code(), node.status.code());
        assert_eq!(actual.stdout, node.stdout);
        assert_eq!(actual.stderr, node.stderr);
        for path in [".bitmap", ".bit/index.json", ".bit/staged-config/my-scope/dev.json"] {
            assert_eq!(
                fs::read(helper.scopes.local_path.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
    }
}

#[test]
fn linear_lane_snap_removal_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = 'one';");
    helper.add_component_bar_foo();
    helper.run("snap --message one");
    helper.output_file("bar/foo.js", "module.exports = 'two';");
    helper.run("snap --message two");
    let baseline = helper.clone_workspace();
    for suffix in ["", " --force", " --keep-files"] {
        helper.get_cloned_workspace(&baseline);
        let node_root = helper.clone_workspace();
        let command = format!("remove bar/foo --silent{suffix}");
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(&command);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        let root = &helper.scopes.local_path;
        for path in [".bitmap", ".bit/index.json", ".bit/staged-config/my-scope/dev.json"] {
            assert_eq!(
                fs::read(root.join(path)).unwrap(),
                fs::read(node_root.join(path)).unwrap(),
                "{path}",
            );
        }
        let native_objects = scope_objects(root);
        let node_objects = scope_objects(&node_root);
        assert_eq!(
            native_objects.keys().collect::<Vec<_>>(),
            node_objects.keys().collect::<Vec<_>>(),
            "{suffix}",
        );
        for (path, bytes) in native_objects {
            assert!(bytes == node_objects[&path], "{path:?}");
        }
        assert_eq!(root.join("bar/foo.js").exists(), node_root.join("bar/foo.js").exists());
    }
}

#[test]
fn populated_lane_version_history_removal_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = 'one';");
    helper.add_component_bar_foo();
    helper.run("snap --message one");
    helper.output_file("bar/foo.js", "module.exports = 'two';");
    helper.run("snap --message two");
    let root = &helper.scopes.local_path;
    let status = Helper::cmd_in_with(root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(status.status.success());
    let baseline = helper.clone_workspace();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "remove bar/foo --silent",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("remove bar/foo --silent");
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    for path in [".bitmap", ".bit/index.json", ".bit/staged-config/my-scope/dev.json"] {
        assert_eq!(
            fs::read(root.join(path)).unwrap(),
            fs::read(node_root.join(path)).unwrap(),
            "{path}",
        );
    }
    assert_eq!(scope_objects(root), scope_objects(&node_root));
    assert!(baseline.join(".bit/objects/d7/fbb87919452525f35e171b15116996ab6448af").is_file());
}
