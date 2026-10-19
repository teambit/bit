//! Released `ListCmd` output and read-only inventory parity.

use crate::helper::{Helper, Run};
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
            let entry = entry.unwrap();
            capture(root, &relative.join(entry.file_name()), files);
        }
    }
}

/// Model/index bytes, immutable objects, bitmap and source files, including a real remote.
fn inventory(helper: &Helper, workspace: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    for relative in
        [".bitmap", ".bit/index.json", ".bit/objects", "bar", "ui", "local", "comp1", "comp2"]
    {
        capture(workspace, Path::new(relative), &mut files);
    }
    let remote = &helper.scopes.remote_path;
    let mut remote_files = BTreeMap::new();
    for relative in ["scope.json", "index.json", "objects", ".bit/index.json", ".bit/objects"] {
        capture(remote, Path::new(relative), &mut remote_files);
    }
    for (path, bytes) in remote_files {
        files.insert(Path::new("remote").join(path), bytes);
    }
    files
}

/// The released Node command runs from an identical workspace, and neither list may import or write inventory.
fn compare_with_ownership(helper: &Helper, command: &str, native_owned: bool) -> Run {
    let node_root = helper.clone_workspace();
    let before_native = inventory(helper, &helper.scopes.local_path);
    let before_node = inventory(helper, &node_root);
    assert_eq!(before_native, before_node);
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = if native_owned {
        helper.native_run(command)
    } else {
        Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE_QUIET", OsStr::new("1"))],
        )
    };
    assert_eq!(native.native, native_owned, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{command}");
    assert_eq!(native.stdout, node.stdout, "{command}");
    assert_eq!(native.stderr, node.stderr, "{command}");
    assert_eq!(inventory(helper, &helper.scopes.local_path), before_native, "{command}");
    assert_eq!(inventory(helper, &node_root), before_node, "{command}");
    native
}

pub(super) fn compare(helper: &Helper, command: &str) -> Run {
    compare_with_ownership(helper, command, true)
}

fn compare_declined(helper: &Helper, command: &str) -> Run {
    compare_with_ownership(helper, command, false)
}

fn two_components(helper: &Helper) {
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.output_file("ui/button/index.js", "module.exports = 'button';");
    helper.run("add ui/button -i ui/button");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(helper);
}

#[test]
fn remote_and_local_include_deleted_match_released_node_in_json_ids_and_table() {
    let helper = Helper::new();
    two_components(&helper);
    helper.run("delete ui/button --silent");
    helper.output_file("bar/foo.js", "module.exports = 'next';");
    helper.run("snap --message after-delete");
    crate::helper::remote::publish(&helper);
    let remote = &helper.scopes.remote;
    for command in [
        "list --local-scope --json --include-deleted".to_string(),
        "list --local-scope --ids --include-deleted".to_string(),
        "list --local-scope --include-deleted".to_string(),
        format!("list {remote} --json --include-deleted"),
        format!("list {remote} --ids --include-deleted"),
        format!("list {remote} --include-deleted"),
    ] {
        assert!(compare(&helper, &command).status.success(), "{command}");
    }
}

#[test]
fn workspace_scope_and_namespace_filters_match_released_node() {
    let helper = Helper::new();
    two_components(&helper);
    let remote = &helper.scopes.remote;
    for command in [
        "list --json".to_string(),
        "list --ids".to_string(),
        "list".to_string(),
        format!("list --local-scope --json --scope {remote}"),
        "list --local-scope --json --scope absent".to_string(),
        "list --local-scope --json --namespace ui".to_string(),
        format!("list {remote} --json --namespace ui"),
    ] {
        assert!(compare(&helper, &command).status.success(), "{command}");
    }
}

#[test]
fn outdated_lane_and_missing_remote_ids_match_released_node_without_importing() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    for command in ["list --local-scope --json --outdated", "list --local-scope --ids --outdated"] {
        assert!(compare(&helper, command).status.success(), "{command}");
    }
    assert!(!compare_declined(&helper, "list --local-scope --outdated").status.success());
    helper.run("switch main -x");
    helper.output_file("local/index.js", "module.exports = 'local';");
    helper.run("add local -i bar/local");
    helper.tag_without_build("bar/local", "");
    let listed = compare(&helper, "list --local-scope --json --outdated");
    assert!(listed.status.success(), "{}", listed.stderr);
    assert!(listed.stdout.contains("bar/local"), "{}", listed.stdout);
}

#[test]
fn outdated_missing_remote_component_declines_before_any_inventory_write() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    crate::helper::remote::publish(&helper);
    // The workspace still has the exported model and its configured remote name,
    // but that remote no longer holds the requested Component.
    helper.re_init_remote_scope();
    let run = compare_declined(&helper, "list --local-scope --json --outdated");
    assert!(!run.status.success(), "{}", run.stdout);
}
