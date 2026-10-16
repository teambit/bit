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
