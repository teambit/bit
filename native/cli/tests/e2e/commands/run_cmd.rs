use crate::{helper::Helper, known_failure::KnownResult};
use std::{ffi::OsStr, fs};

#[test]
fn run_unsupported_help_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-run-help");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in
            ["run --no-color", "run missing-app --no-color", "run --json", "run missing-app --json"]
        {
            for native_env in [&[][..], &ci_env[..]] {
                let mut node_env = vec![("BIT_NATIVE", OsStr::new("off"))];
                node_env.extend_from_slice(native_env);
                let node = Helper::cmd_in_with(directory, command, &node_env);
                let native = Helper::cmd_in_with(directory, command, native_env);
                assert!(native.native, "{command}: node={node:?}; native={native:?}");
                assert_eq!(native.status.code(), node.status.code(), "{command}");
                assert_eq!(native.stdout, node.stdout, "{command}");
                assert_eq!(native.stderr, node.stderr, "{command}");
            }
        }
    }
    Ok(())
}

#[test]
fn run_without_apps_in_ci_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-run-ci");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let workspace = &helper.scopes.local_path;
    for directory in [&outside, &bare_scope, workspace] {
        for command in ["run", "run missing-app"] {
            let node = Helper::cmd_in_with(
                directory,
                command,
                &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
            );
            let native = Helper::cmd_in_with(directory, command, &[("CI", OsStr::new("1"))]);
            assert!(native.native, "{command}: node={node:?}; native={native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
    }
    helper.populate_components(1, true, "");
    let command = "run";
    let node = Helper::cmd_in_with(
        workspace,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let native = Helper::cmd_in_with(workspace, command, &[("CI", OsStr::new("1"))]);
    assert!(native.native, "{command}: node={node:?}; native={native:?}");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    Ok(())
}

#[test]
fn run_outside_workspace_and_bare_scope_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-run");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    for directory in [&outside, &bare_scope] {
        for command in ["run", "run missing-app", "run -d", "run missing-app --no-browser"] {
            let node =
                Helper::cmd_in_with(directory, command, &[("BIT_NATIVE", OsStr::new("off"))]);
            let native = Helper::cmd_in(directory, command);
            assert!(native.native, "{command}: node={node:?}; native={native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
    }
    Ok(())
}

#[test]
fn run_without_apps_in_component_workspaces_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    let workspace = &helper.scopes.local_path;
    for count in [0, 1, 2] {
        if count > 0 {
            helper.populate_components(count, true, "");
        }
        for command in ["run", "run missing-app"] {
            let node =
                Helper::cmd_in_with(workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
            let native = Helper::cmd_in(workspace, command);
            assert_eq!(node.status.code(), Some(1), "{command}: {node:?}");
            assert!(native.native, "{command}: {native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
    }
    Ok(())
}
