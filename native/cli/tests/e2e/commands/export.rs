//! `e2e/commands/export.e2e.ts`.

#[cfg(unix)]
mod shared;

use crate::helper::{FOO_FIXTURE, Helper, config, parse, setup};
use serde_json::Value;
use std::{ffi::OsStr, fs, path::Path};

#[test]
fn head_only_main_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'head';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message first");
    let before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = "export --head-only";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&before);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code(), "native: {native:?}; node: {node:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
    assert_eq!(
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap()),
        parse(&fs::read_to_string(node_root.join(".bit/index.json")).unwrap()),
    );
    helper.create_component_bar_foo("module.exports = () => 'second';");
    helper.run("tag bar/foo --message second");
    assert_head_only_main_export(&helper);
}

fn assert_head_only_main_export(helper: &Helper) {
    let before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = "export --head-only";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&before);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code(), "native: {native:?}; node: {node:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
}

#[test]
fn head_only_lane_reexport_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'head';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    crate::helper::remote::publish(&helper);
    let before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = "export --head-only";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&before);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code(), "native: {native:?}; node: {node:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
}

#[test]
fn head_only_lane_first_and_advanced_export_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'head';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message first");
    if let Some(destination) = std::env::var_os("BIT_NATIVE_EXPORT_HEAD_ONLY_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
        setup::copy_dir(&setup::shared().root.join("home"), &destination.join("home"));
        setup::copy_dir(&setup::shared().root.join("globals"), &destination.join("globals"));
    }
    assert_head_only_lane_export(&helper);
    helper.run("snap --unmodified --message second");
    assert_head_only_lane_export(&helper);
}

fn assert_head_only_lane_export(helper: &Helper) {
    let before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = "export --head-only";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&before);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code(), "native: {native:?}; node: {node:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
}

#[test]
fn selected_staged_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("// selected");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message selected");
    if let Some(destination) = std::env::var_os("BIT_NATIVE_EXPORT_SELECTED_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&node_root, "export bar/foo", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export bar/foo");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
    for path in [".bitmap", ".bit/index.json", ".bit/scope.json"] {
        let native_bytes = fs::read_to_string(helper.scopes.local_path.join(path)).unwrap();
        let node_bytes = fs::read_to_string(node_root.join(path)).unwrap();
        let native_json = if path == ".bitmap" {
            parse(&native_bytes[native_bytes.find('{').unwrap()..])
        } else {
            parse(&native_bytes)
        };
        let node_json = if path == ".bitmap" {
            parse(&node_bytes[node_bytes.find('{').unwrap()..])
        } else {
            parse(&node_bytes)
        };
        assert_eq!(native_json, node_json, "{path}");
    }
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn selected_unmodified_component_matches_node() {
    let helper = tagged_bar_foo();
    crate::helper::remote::publish(&helper);
    if let Some(destination) = std::env::var_os("BIT_NATIVE_EXPORT_REPEAT_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&node_root, "export bar/foo", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export bar/foo");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
    for path in [".bitmap", ".bit/index.json", ".bit/scope.json"] {
        let native_bytes = fs::read_to_string(helper.scopes.local_path.join(path)).unwrap();
        let node_bytes = fs::read_to_string(node_root.join(path)).unwrap();
        let native_json = if path == ".bitmap" {
            parse(&native_bytes[native_bytes.find('{').unwrap()..])
        } else {
            parse(&native_bytes)
        };
        let node_json = if path == ".bitmap" {
            parse(&node_bytes[node_bytes.find('{').unwrap()..])
        } else {
            parse(&node_bytes)
        };
        assert_eq!(native_json, node_json, "{path}");
    }
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn mixed_staged_and_unmodified_selection_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    helper.run("export comp2");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = "export comp2 comp1";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run(command);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
}

#[test]
fn selected_unmodified_export_to_recreated_remote_matches_node() {
    let helper = exported_to_a_recreated_remote();
    let node_root = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&node_root, "export comp1", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run("export comp1");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn multiple_selected_components_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = "export comp1 comp2";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run(command);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
}

#[test]
fn selected_scoped_version_matches_node() {
    let helper = tagged_bar_foo();
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = format!("export {}/bar/foo@0.0.1", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run(&command);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
}

#[test]
fn all_reexports_an_existing_component_like_node() {
    let helper = exported_to_a_recreated_remote();
    assert_reexport(&helper, "", "--all");
}

#[test]
fn all_exports_to_a_recreated_remote() {
    let helper = exported_to_a_recreated_remote();
    let remote = &helper.scopes.remote;
    assert_reexport(&helper, &format!("{remote} {remote}/*"), "--all");
}

#[test]
fn all_versions_exports_to_a_recreated_remote() {
    let helper = exported_to_a_recreated_remote();
    let remote = &helper.scopes.remote;
    assert_reexport(&helper, &format!("{remote} {remote}/*"), "--all-versions");
}

#[test]
fn all_versions_reexports_full_history_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("// v1");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message first");
    crate::helper::remote::publish(&helper);
    helper.create_component_bar_foo("// v2");
    helper.run("tag bar/foo --message second");
    crate::helper::remote::publish(&helper);
    helper.re_init_remote_scope();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_EXPORT_ALL_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    assert_reexport(&helper, "", "--all-versions");
}

fn assert_reexport(helper: &Helper, ids: &str, flag: &str) {
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = format!("export {ids} {flag}");
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run(&command);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
    for path in [".bitmap", ".bit/index.json", ".bit/scope.json"] {
        let native_bytes = fs::read_to_string(helper.scopes.local_path.join(path)).unwrap();
        let node_bytes = fs::read_to_string(node_root.join(path)).unwrap();
        let native_json = if path == ".bitmap" {
            parse(&native_bytes[native_bytes.find('{').unwrap()..])
        } else {
            parse(&native_bytes)
        };
        let node_json = if path == ".bitmap" {
            parse(&node_bytes[node_bytes.find('{').unwrap()..])
        } else {
            parse(&node_bytes)
        };
        assert_eq!(native_json, node_json, "{path}");
    }
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

/// Node may persist independent Component index rows in either completion order.
fn remote_index_by_identity(scope: &Path) -> Value {
    let mut index = match fs::read_to_string(scope.join("index.json")) {
        Ok(bytes) => parse(&bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Value::Null,
        Err(error) => panic!("remote index {}: {error}", scope.display()),
    };
    index["components"]
        .as_array_mut()
        .unwrap()
        .sort_by(|a, b| {
            a["id"]["scope"]
                .as_str()
                .cmp(&b["id"]["scope"].as_str())
                .then_with(|| {
                    a["id"]["name"]
                        .as_str()
                        .cmp(&b["id"]["name"].as_str())
                })
        });
    index
}

fn object_names(scope: &Path) -> Vec<String> {
    let mut names = Vec::new();
    for prefix in fs::read_dir(scope.join("objects")).unwrap() {
        let prefix = prefix.unwrap();
        for object in fs::read_dir(prefix.path()).unwrap() {
            let object = object.unwrap();
            names.push(format!(
                "{}/{}",
                prefix.file_name().to_string_lossy(),
                object.file_name().to_string_lossy(),
            ));
        }
    }
    names.sort();
    names
}

#[test]
fn cross_scope_forked_lane_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let fork_scope = format!("{}-fork", helper.scopes.remote);
    let fork_remote = helper.scopes.e2e_dir.join(&fork_scope);
    fs::create_dir_all(&fork_remote).unwrap();
    let init =
        Helper::cmd_in_with(&fork_remote, "init --bare", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(init.status.success(), "{}", init.stderr);
    config::update_scope_json(&fork_remote.join("scope.json"), |scope| {
        scope["remotes"][&helper.scopes.remote] =
            serde_json::json!(format!("file://{}", helper.scopes.remote_path.display()));
    });
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"][&fork_scope] =
            serde_json::json!(format!("file://{}", fork_remote.display()));
    });
    helper.populate_components(2, true, "");
    helper.run("tag");
    crate::helper::remote::publish(&helper);
    helper.run("lane create parent");
    helper.run("snap --unmodified --message parent");
    crate::helper::remote::publish(&helper);
    helper.run(&format!("lane create child --scope {fork_scope} --fork-lane-new-scope"));
    helper.run("snap comp1 --unmodified --message child");
    if let Some(destination) = std::env::var_os("BIT_NATIVE_EXPORT_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("parent-remote"));
        setup::copy_dir(&fork_remote, &destination.join("fork-remote"));
    }
    let remote_before = helper.clone_remote_at(&fork_remote);
    let node_root = helper.clone_workspace();
    let node_ci_root = helper.clone_workspace();
    let rust_ci_root = helper.clone_workspace();
    let node_ci = Helper::cmd_in_with(
        &node_ci_root,
        "export --fork-lane-new-scope",
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    assert!(node_ci.status.success(), "{}", node_ci.stderr);
    Helper::restore_remote_at(&fork_remote, &remote_before);
    let rust_ci = Helper::cmd_in_with(
        &rust_ci_root,
        "export --fork-lane-new-scope",
        &[("CI", OsStr::new("1"))],
    );
    assert!(rust_ci.native, "{}", rust_ci.trace);
    assert_eq!(rust_ci.status.code(), node_ci.status.code());
    assert_eq!(rust_ci.stdout, node_ci.stdout);
    assert_eq!(rust_ci.stderr, node_ci.stderr);
    Helper::restore_remote_at(&fork_remote, &remote_before);
    let node = Helper::cmd_in_with(
        &node_root,
        "export --fork-lane-new-scope",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_at(&fork_remote);
    Helper::restore_remote_at(&fork_remote, &remote_before);
    let native = helper.native_run("export --fork-lane-new-scope");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(remote_index_by_identity(&fork_remote), remote_index_by_identity(&node_remote));
    assert_eq!(object_names(&fork_remote), object_names(&node_remote));
    for path in [
        ".bitmap".to_owned(),
        ".bit/scope.json".to_owned(),
        ".bit/index.json".to_owned(),
        format!(".bit/refs/remotes/{fork_scope}/child"),
    ] {
        let native_bytes = fs::read_to_string(helper.scopes.local_path.join(&path)).unwrap();
        let node_bytes = fs::read_to_string(node_root.join(&path)).unwrap();
        let native_json = if path == ".bitmap" {
            parse(&native_bytes[native_bytes.find('{').unwrap()..])
        } else {
            parse(&native_bytes)
        };
        let node_json = if path == ".bitmap" {
            parse(&node_bytes[node_bytes.find('{').unwrap()..])
        } else {
            parse(&node_bytes)
        };
        assert_eq!(native_json, node_json, "{path}");
    }
    let node_status = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native_status = helper.native_run("status --json --lanes");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
    let remote_before_repeat = helper.clone_remote_at(&fork_remote);
    let node_repeat = Helper::cmd_in_with(
        &node_root,
        "export --fork-lane-new-scope",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    Helper::restore_remote_at(&fork_remote, &remote_before_repeat);
    let native_repeat = helper.native_run("export --fork-lane-new-scope");
    assert_eq!(native_repeat.status.code(), node_repeat.status.code());
    assert_eq!(native_repeat.stdout, node_repeat.stdout);
    assert_eq!(native_repeat.stderr, node_repeat.stderr);
}

#[test]
fn forked_lane_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create parent");
    helper.run("snap --unmodified --message parent");
    crate::helper::remote::publish(&helper);
    helper.run("lane create child");
    helper.run("snap --unmodified --message child");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_refs =
        fs::read(node_root.join(format!(".bit/refs/remotes/{}/child", helper.scopes.remote)))
            .unwrap();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let native_refs = fs::read(helper.scopes.local_path.join(format!(
        ".bit/refs/remotes/{}/child",
        helper.scopes.remote,
    )))
    .unwrap();
    assert_eq!(native_refs, node_refs);
    let node_status = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native_status = helper.native_run("status --json --lanes");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

fn lane_full_history_case(command: &str, with_lane_snap: bool) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    if with_lane_snap {
        helper.run("snap --unmodified --message lane-first");
        helper.run("snap --unmodified --message lane-second");
    }
    if let Some(destination) = std::env::var_os("BIT_NATIVE_EXPORT_LANE_ALL_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    assert_full_lane_export(&helper, command);
}

fn assert_full_lane_export(helper: &Helper, command: &str) {
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{command}: {}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run(command);
    assert!(native.native, "{command}: {}", native.trace);
    assert_eq!(
        native.status.code(),
        node.status.code(),
        "native stdout: {}\nnative stderr: {}\ntrace: {}\nnode stdout: {}\nnode stderr: {}",
        native.stdout,
        native.stderr,
        native.trace,
        node.stdout,
        node.stderr,
    );
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    assert_eq!(object_names(&helper.scopes.remote_path), object_names(&node_remote));
    for path in [".bitmap", ".bit/index.json", ".bit/scope.json"] {
        let native_bytes = fs::read_to_string(helper.scopes.local_path.join(path)).unwrap();
        let node_bytes = fs::read_to_string(node_root.join(path)).unwrap();
        let native_json = parse(&native_bytes[native_bytes.find('{').unwrap()..]);
        let node_json = parse(&node_bytes[node_bytes.find('{').unwrap()..]);
        assert_eq!(native_json, node_json, "{path}");
    }
}

#[test]
fn all_lanes_with_inherited_main_component_match_node() {
    lane_full_history_case("export --all", false);
}

#[test]
fn all_versions_on_lane_match_node() {
    lane_full_history_case("export --all-versions", true);
}

#[test]
fn all_versions_repeats_an_exported_lane_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    crate::helper::remote::publish(&helper);
    assert_full_lane_export(&helper, "export --all-versions");
}

#[test]
fn all_exports_a_renamed_lane_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("lane rename renamed");
    assert_full_lane_export(&helper, "export --all");
}

#[test]
fn ordinary_export_after_lane_rename_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("lane create dev");
    helper.run("snap --message lane");
    helper.run("lane rename renamed");
    assert_full_lane_export(&helper, "export");
}

#[test]
fn all_exports_lane_and_inherited_main_components_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.output_file("baz/qux.js", "module.exports = () => 'qux';");
    helper.run("add baz -i baz/qux");
    helper.run("tag --message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = () => 'lane foo';");
    helper.run("snap --message lane");
    assert_full_lane_export(&helper, "export --all");
}

#[test]
fn deleted_lane_component_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    crate::helper::remote::publish(&helper);
    helper.run("delete bar/foo --silent --lane");
    helper.run("snap --unmodified --message removal");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_refs =
        fs::read(node_root.join(format!(".bit/refs/remotes/{}/dev", helper.scopes.remote)))
            .unwrap();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let native_refs = fs::read(helper.scopes.local_path.join(format!(
        ".bit/refs/remotes/{}/dev",
        helper.scopes.remote,
    )))
    .unwrap();
    assert_eq!(native_refs, node_refs);
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn fresh_lane_component_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("lane create dev");
    helper.run("snap --message first");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let node_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        remote_index_by_identity(&helper.scopes.remote_path),
        remote_index_by_identity(&node_remote),
    );
    for path in [
        ".bitmap".to_owned(),
        ".bit/scope.json".to_owned(),
        ".bit/index.json".to_owned(),
        format!(".bit/refs/remotes/{}/dev", helper.scopes.remote),
    ] {
        let native_bytes = fs::read_to_string(helper.scopes.local_path.join(&path)).unwrap();
        let node_bytes = fs::read_to_string(node_root.join(&path)).unwrap();
        let native_json = if path == ".bitmap" {
            parse(&native_bytes[native_bytes.find('{').unwrap()..])
        } else {
            parse(&native_bytes)
        };
        let node_json = if path == ".bitmap" {
            parse(&node_bytes[node_bytes.find('{').unwrap()..])
        } else {
            parse(&node_bytes)
        };
        assert_eq!(native_json, node_json, "{path}");
    }
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
    assert!(
        parse(&native_status.stdout)["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

#[test]
fn hidden_lane_update_dependent_exports_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap comp2 --skip-auto-snap --unmodified --message lane");
    crate::helper::remote::publish(&helper);
    helper.seed_hidden_update_dependent(
        &format!("{}/comp1", helper.scopes.remote),
        &format!("{}/dev", helper.scopes.remote),
    );
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/dev -x", helper.scopes.remote));
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    helper.output_file(
        &format!("{}/comp2/index.js", helper.scopes.remote),
        "module.exports = () => 'comp2-v2';",
    );
    helper.run("snap --message update");
    let remote_before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let remote_ref = format!("refs/remotes/{}/dev", helper.scopes.remote);
    let node_refs = parse(&fs::read_to_string(node_root.join(".bit").join(&remote_ref)).unwrap());
    helper.restore_remote_scope(&remote_before);
    let native = helper.native_run("export");
    assert_eq!(native.stdout, node.stdout, "{native:?}");
    assert_eq!(native.stderr, node.stderr);
    let native_refs =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit").join(remote_ref)).unwrap());
    assert_eq!(native_refs, node_refs);
    assert_eq!(
        fs::read(
            helper.scopes.local_path
                .join(".bit/refs/remotes")
                .join(&helper.scopes.remote)
                .join("dev")
        )
        .unwrap(),
        fs::read(
            node_root
                .join(".bit/refs/remotes")
                .join(&helper.scopes.remote)
                .join("dev")
        )
        .unwrap(),
    );
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
    let node_repeat =
        Helper::cmd_in_with(&node_root, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_repeat = helper.native_run("export");
    assert_eq!(native_repeat.stdout, node_repeat.stdout);
    assert_eq!(native_repeat.stderr, node_repeat.stderr);
}

/// export a component when the checked out version is not the latest › .bitmap should keep
/// the current version and do not update to the latest version; bit show should display the
/// component with the current version, not the latest; the file content should not be
/// changed
#[test]
fn exporting_an_older_checked_out_version_keeps_it() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("// v2");
    helper.add_component_bar_foo();
    helper.run("tag --unmodified --ver 2.0.0");
    helper.native("export");
    helper.create_component_bar_foo("// v1");
    helper.run("tag --unmodified --ver 1.0.0");
    helper.native("export");
    let bitmap = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    let bitmap = parse(&bitmap[bitmap.find('{').unwrap()..]);
    assert_eq!(bitmap["bar/foo"]["version"], "1.0.0");
    let show = helper.run("show bar/foo");
    assert!(show.contains("1.0.0") && !show.contains("2.0.0"), "{show}");
    let content = fs::read_to_string(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    assert_eq!(content, "// v1");
}

/// An exported `comp1` whose remote was created again.
fn exported_to_a_recreated_remote() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_remote_scope();
    helper
}

/// export after re-creating the remote › export without any flag › should show a message
/// that nothing to export
#[test]
fn a_recreated_remote_has_nothing_to_export() {
    let output = exported_to_a_recreated_remote().native("export");
    assert!(output.contains("nothing to export"), "{output}");
}

fn tagged_bar_foo() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper
}

fn export_ids(helper: &Helper, ids: &str) -> String {
    let command = format!("export {ids}");
    let backup = helper.clone_remote_scope();
    let oracle = helper.clone_workspace();
    let node = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    helper.restore_remote_scope(&backup);
    let actual = helper.native_run(&command);
    assert_eq!(actual.status.code(), node.status.code());
    assert!(actual.status.success(), "{}", actual.stderr);
    assert_eq!(actual.stdout, node.stdout);
    assert_eq!(actual.stderr, node.stderr);
    if cfg!(windows) {
        crate::helper::remote::seed_after_export_at(helper, &helper.scopes.local_path);
    }
    actual.stdout
}

#[test]
fn multiple_versions_are_exported() {
    let helper = tagged_bar_foo();
    export_ids(&helper, "bar/foo");
    helper.tag_without_build("bar/foo", "--unmodified");
    export_ids(&helper, "bar/foo");
    let output = helper.run(&format!("list {}", helper.scopes.remote));
    assert!(output.contains("found 1 components"), "{output}");
    assert!(output.contains("bar/foo"), "{output}");
    assert!(output.contains('2'), "{output}");
}

#[test]
fn an_imported_component_is_exported_twice() {
    let helper = tagged_bar_foo();
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let remote = &helper.scopes.remote;
    helper.run(&format!("import {remote}/bar/foo --path components/bar/foo"));
    helper.output_file("components/bar/foo/foo.js", r#"console.log("got foo v2")"#);
    helper.tag_component_bar_foo();
    export_ids(&helper, "bar/foo");
    helper.output_file("components/bar/foo/foo.js", r#"console.log("got foo v3")"#);
    helper.tag_component_bar_foo();
    export_ids(&helper, "bar/foo");
    let output = helper.run(&format!("list {remote} --ids"));
    assert!(output.contains(&format!("{remote}/bar/foo@0.0.3")), "{output}");
}

#[test]
fn reexporting_by_name_without_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.tag_without_build("bar/foo", "--unmodified");
    crate::helper::remote::publish(&helper);
    helper.tag_without_build("bar/foo", "--unmodified");
    let output = export_ids(&helper, "bar/foo");
    assert!(
        output.contains(if cfg!(windows) {
            "nothing to export"
        } else {
            "exported components (1)"
        }),
        "{output}",
    );
}

/// Native `bit export` declines an empty workspace (`commandOutboundPrepare: No such file or
/// directory`), and a remote init with `--shared` (`outbound file remote group ownership
/// requires canonical export`); native `bit import` declines the e2e workspace (`status
/// configured extensions require Harmony`).
mod known_failures {
    use crate::{
        allow_known_failure,
        helper::{FOO_FIXTURE, Helper},
        known_failure::Native,
    };
    use std::fs;

    /// with no components to export › should print nothing to export
    #[test]
    fn nothing_to_export() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let output = allow_known_failure!(helper.native_output_or_known("export"));
        assert!(output.contains("nothing to export"), "{output}");
    }

    /// with a PNG file › should export it with no errors; after importing the file › the
    /// size of the binary file should not be changed
    #[test]
    fn a_png_file_keeps_its_size() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.create_component_bar_foo(FOO_FIXTURE);
        let source = concat!(env!("CARGO_MANIFEST_DIR"), "/../../e2e/fixtures/png_fixture.png");
        let png = helper.scopes.local_path.join("bar/png_fixture.png");
        fs::copy(source, &png).unwrap();
        let size = fs::metadata(&png).unwrap().len();
        helper.run("add bar -m foo.js -i bar/foo");
        helper.tag_without_build("", "");
        helper.native("export");
        if cfg!(windows) {
            crate::helper::remote::seed_after_export_at(&helper, &helper.scopes.local_path);
        }
        let remote = &helper.scopes.remote;
        let output = helper.run(&format!("list {remote}"));
        assert!(output.contains("found 1 components"), "{output}");
        assert!(output.contains("bar/foo"), "{output}");
        let import = format!("import {remote}/bar/foo");
        allow_known_failure!(helper.native_output_or_known(&import));
        assert_eq!(fs::metadata(&png).unwrap().len(), size);
    }

    /// `bit init --bare --shared <group>` as the remote scope.
    #[cfg(unix)]
    fn shared_remote(helper: &Helper, group: &str) {
        let remote = &helper.scopes.remote_path;
        let _ = fs::remove_dir_all(remote);
        fs::create_dir_all(remote).unwrap();
        let run = Helper::cmd_in(remote, &format!("init --bare --shared {group}"));
        assert!(run.status.success(), "{}", run.stderr);
        helper.add_remote_scope();
    }

    /// A tagged `bar/foo` whose remote was init with `--shared <group>`.
    #[cfg(unix)]
    fn tagged_for_shared_remote(group: &str) -> Helper {
        let helper = Helper::new();
        helper.re_init_workspace();
        shared_remote(&helper, "nonExistGroup");
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        helper.tag_without_build("", "");
        shared_remote(&helper, group);
        helper
    }

    /// applying permissions on the remote scope when was init with shared flag › when the
    /// group name does not exist › should throw an error indicating that the group does not
    /// exist (unless it is Windows)
    #[cfg(unix)]
    #[test]
    fn a_missing_shared_group_fails_the_export() {
        let helper = tagged_for_shared_remote("nonExistGroup");
        let run = allow_known_failure!(helper.native_or_known("export"));
        let output = format!("{}{}", run.stdout, run.stderr);
        assert!(output.contains(r#"unable to resolve group id of "nonExistGroup""#), "{output}");
    }

    /// applying permissions on the remote scope when was init with shared flag › when the
    /// group exists and the current user has permission to that group › should export the
    /// component successfully and change the owner to that group
    #[cfg(unix)]
    #[test]
    fn an_existing_shared_group_owns_the_export() {
        let group = std::process::Command::new("id")
            .arg("-gn")
            .output()
            .unwrap();
        let group = String::from_utf8(group.stdout).unwrap();
        let helper = tagged_for_shared_remote(group.trim());
        let output = helper.native_output_or_known("export").native();
        assert!(
            output.contains(if cfg!(windows) {
                "nothing to export"
            } else {
                "exported components (1)"
            }),
            "{output}",
        );
    }
}
