use crate::{helper::Helper, known_failure::KnownResult};
use std::{ffi::OsStr, fs};

#[test]
fn app_and_list_help_match_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-help-success");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    let color_env = [("FORCE_COLOR", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in [
            "app --help",
            "apps --help",
            "app -h",
            "app list --help",
            "apps list --help",
            "apps list -h",
        ] {
            for native_env in [&[][..], &ci_env[..], &color_env[..]] {
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
fn app_run_help_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-run-help-success");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    let color_env = [("FORCE_COLOR", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in [
            "app run --help",
            "apps run -h",
            "app c --help",
            "apps c -h",
            "app run missing-app --help",
            "apps c missing-app -h",
        ] {
            for native_env in [&[][..], &ci_env[..], &color_env[..]] {
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
fn app_run_alias_without_apps_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-run-alias");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let workspace = &helper.scopes.local_path;
    let ci_env = [("CI", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, workspace] {
        for command in ["app c", "apps c missing-app", "app c missing-app --dev"] {
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
    helper.populate_components(1, true, "");
    for native_env in [&[][..], &ci_env[..]] {
        let mut node_env = vec![("BIT_NATIVE", OsStr::new("off"))];
        node_env.extend_from_slice(native_env);
        let node = Helper::cmd_in_with(workspace, "app c", &node_env);
        let native = Helper::cmd_in_with(workspace, "app c", native_env);
        assert!(native.native, "node={node:?}; native={native:?}");
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
    }
    Ok(())
}

#[test]
fn app_rejected_flags_help_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-help");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    let color_env = [("FORCE_COLOR", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in [
            "app --json",
            "apps --json",
            "app -j",
            "apps --json --json",
            "app --json -j",
            "apps -j --json",
            "app -j -j",
            "apps --json --no-color",
            "app -j --no-color",
            "apps --no-color --json",
            "app --no-color -j",
            "apps --no-color --no-color",
            "app --json --no-color -j --json",
            "apps list --no-color --no-color",
            "app list --json --no-color -j --no-color",
            "apps list --json=false --no-color --json=true",
            "app --no-color",
            "apps --no-color",
            "app list --no-color",
            "apps list --no-color",
            "app list --json --no-color",
            "apps list --no-color --json",
            "app list -j --no-color",
            "apps list --no-color -j",
            "app list --json=true --no-color",
            "apps list --json=false --no-color",
            "app list --json true --no-color",
            "apps list --no-color --json false",
            "app list -j false --no-color",
            "apps list --no-color -j true",
            "app list --json --no-color true",
            "apps list -j --no-color false",
            "app list --no-color true --json",
            "apps list --no-color false -j",
            "app list true --json --no-color",
            "apps list false -j --no-color",
            "app list true --no-color -j",
            "apps list false --no-color --json",
            "app run --ssr",
            "apps run --ssr",
            "app c --ssr",
            "apps c --ssr",
            "app run missing-app --ssr",
            "apps c missing-app --ssr",
            "app run --json",
            "apps c --json",
            "app run missing-app --json",
            "apps run missing-app --json",
            "app run --no-color",
            "apps c --no-color",
            "app run missing-app --no-color",
            "apps run missing-app --no-color",
        ] {
            for native_env in [&[][..], &ci_env[..], &color_env[..]] {
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
fn app_rejected_options_match_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-rejected-options");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in [
            "app --ssr",
            "apps --dev",
            "app --verbose",
            "apps --no-browser",
            "app list --ssr",
            "apps list --dev",
            "app list --verbose",
            "apps list --no-browser",
        ] {
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
fn app_rejected_run_only_options_match_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-rejected-run-only-options");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in [
            "app --watch",
            "apps --port",
            "app --port 4000",
            "apps --port=4000",
            "app --args",
            "apps --args value",
            "app --args=value",
            "apps list --watch",
            "app list --port",
            "apps list --port 4000",
            "app list --port=4000",
            "apps list --args",
            "app list --args value",
            "apps list --args=value",
        ] {
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
fn app_rejected_option_aliases_and_inline_values_match_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-rejected-option-aliases");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in [
            "app -d",
            "apps -v",
            "app -n",
            "apps -w",
            "app -p 4000",
            "apps -p=4000",
            "app -a value",
            "apps -a=value",
            "app --json=true",
            "apps --no-color=true",
            "app --watch=true",
            "apps --no-browser=false",
            "app list -d",
            "apps list -v",
            "app list -n",
            "apps list -w",
            "app list -p 4000",
            "apps list -p=4000",
            "app list -a value",
            "apps list -a=value",
            "app list --no-color=true",
            "apps list --dev=true",
            "app list --watch=true",
            "apps list --no-browser=false",
        ] {
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
fn app_list_with_apps_in_ci_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.output_file(
        "comp1/comp1.node-app.js",
        "module.exports.default = { name: 'sample-app', entry: require.resolve('./index.js') };\n",
    );
    helper.run("add comp1");
    for command in ["app", "app list", "apps list --json", "app list -j"] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
        );
        let native =
            Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
        assert!(native.native, "{command}: node={node:?}; native={native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    Ok(())
}

#[test]
fn app_list_inline_json_values_match_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-list-inline-json");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    let commands = [
        "app list --json=true",
        "apps list -j=true",
        "app list --json=false",
        "apps list -j=false",
        "app list --json=1",
        "apps list -j=0",
        "app list --json=foo",
        "apps list --json=",
        "app list --json=TRUE",
        "apps list -j=yes",
        "app list --json true",
        "apps list -j true",
        "app list --json false",
        "apps list -j false",
    ];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in commands {
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
    helper.populate_components(1, true, "");
    helper.output_file(
        "comp1/comp1.node-app.js",
        "module.exports.default = { name: 'sample-app', entry: require.resolve('./index.js') };\n",
    );
    helper.run("add comp1");
    for command in commands {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
        );
        let native =
            Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
        assert!(native.native, "{command}: node={node:?}; native={native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    Ok(())
}

#[test]
fn app_list_without_apps_in_ci_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-list-ci");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let workspace = &helper.scopes.local_path;
    for directory in [&outside, &bare_scope, workspace] {
        for command in ["app", "apps list", "app list --json", "apps list -j"] {
            let node = Helper::cmd_in_with(
                directory,
                command,
                &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
            );
            let native = Helper::cmd_in_with(directory, command, &[("CI", OsStr::new("1"))]);
            assert!(native.native, "{command}: node={node:?}; native={native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}: node={node:?}; native={native:?}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
    }
    helper.populate_components(1, true, "");
    for command in ["app list", "apps list --json"] {
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
    }
    Ok(())
}

#[test]
fn app_run_without_apps_in_ci_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-run-ci");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let workspace = &helper.scopes.local_path;
    for directory in [&outside, &bare_scope, workspace] {
        for command in ["app run", "apps run foo"] {
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
    let command = "app run";
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
            assert!(native.native, "{command}: {native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
    }
    Ok(())
}

#[test]
fn app_run_missing_app_with_flags_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-app-run-flags");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in [
            "app run -d",
            "apps run foo --dev",
            "app run foo -p 4000",
            "apps run foo --no-browser",
            "app run --watch",
            "app run foo --args=--x=1",
            "app run foo --port bad",
        ] {
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
    helper.populate_components(1, true, "");
    for native_env in [&[][..], &ci_env[..]] {
        let mut node_env = vec![("BIT_NATIVE", OsStr::new("off"))];
        node_env.extend_from_slice(native_env);
        let command = "app run foo --dev";
        let node = Helper::cmd_in_with(&helper.scopes.local_path, command, &node_env);
        let native = Helper::cmd_in_with(&helper.scopes.local_path, command, native_env);
        assert!(native.native, "{command}: node={node:?}; native={native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
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
    assert!(native.native, "{native:?}");
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
