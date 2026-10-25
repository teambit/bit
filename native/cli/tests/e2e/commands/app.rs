use crate::{helper::Helper, known_failure::KnownResult};
use std::{ffi::OsStr, fs};

#[test]
fn app_list_outside_workspace_and_in_bare_scope_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    for directory in [&outside, &bare_scope] {
        for command in ["app", "apps", "app list", "apps list", "app list --json", "apps list -j"] {
            let node =
                Helper::cmd_in_with(directory, command, &[("BIT_NATIVE", OsStr::new("off"))]);
            let native = Helper::cmd_in(directory, command);
            assert!(node.status.success(), "{command}: {node:?}");
            assert!(native.status.success() && native.native, "{command}: {native:?}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
        for command in ["app --json", "app list --no-color"] {
            let node =
                Helper::cmd_in_with(directory, command, &[("BIT_NATIVE", OsStr::new("off"))]);
            let native = Helper::cmd_in(directory, command);
            assert!(!native.native, "{command}: {native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
    }
    Ok(())
}

#[test]
fn app_run_outside_workspace_and_in_bare_scope_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-run");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    for directory in [&outside, &bare_scope] {
        for command in ["app run", "apps run", "app run foo", "apps run foo"] {
            let node =
                Helper::cmd_in_with(directory, command, &[("BIT_NATIVE", OsStr::new("off"))]);
            let native = Helper::cmd_in(directory, command);
            assert_eq!(node.status.code(), Some(1), "{command}: {node:?}");
            assert!(native.native, "{command}: {native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
        for command in ["app run --json", "app run foo --json", "app run --no-color"] {
            let node =
                Helper::cmd_in_with(directory, command, &[("BIT_NATIVE", OsStr::new("off"))]);
            let native = Helper::cmd_in(directory, command);
            assert!(!native.native, "{command}: {native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
    }
    Ok(())
}

#[test]
fn app_run_in_empty_workspace_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    let workspace = &helper.scopes.local_path;
    for command in ["app run", "apps run", "app run foo", "apps run foo"] {
        let node = Helper::cmd_in_with(workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = Helper::cmd_in(workspace, command);
        assert_eq!(node.status.code(), Some(1), "{command}: {node:?}");
        assert!(native.native, "{command}: {native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    let command = "app run --json";
    let node = Helper::cmd_in_with(workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = Helper::cmd_in(workspace, command);
    assert!(!native.native, "{native:?}");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    helper.populate_components(1, true, "");
    for command in ["app run", "app run foo"] {
        let node = Helper::cmd_in_with(workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = Helper::cmd_in(workspace, command);
        assert_eq!(node.status.code(), Some(1), "{command}: {node:?}");
        assert!(native.native, "{command}: {native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    helper.populate_components(2, true, "");
    let command = "apps run foo";
    let node = Helper::cmd_in_with(workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = Helper::cmd_in(workspace, command);
    assert_eq!(node.status.code(), Some(1), "{command}: {node:?}");
    assert!(native.native, "{command}: {native:?}");
    assert_eq!(native.status.code(), node.status.code(), "{command}");
    assert_eq!(native.stdout, node.stdout, "{command}");
    assert_eq!(native.stderr, node.stderr, "{command}");
    Ok(())
}
