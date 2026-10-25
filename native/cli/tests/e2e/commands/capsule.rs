use crate::{
    helper::{Helper, parse},
    known_failure::KnownResult,
};
use serde_json::json;
use std::{ffi::OsStr, fs, path::Path};

fn assert_matches_node(helper: &Helper, globals: &Path, command: &str, color: bool) {
    let mut node_env =
        vec![("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))];
    let mut native_env = vec![("BIT_GLOBALS_DIR", globals.as_os_str())];
    if color {
        node_env.push(("FORCE_COLOR", OsStr::new("1")));
        native_env.push(("FORCE_COLOR", OsStr::new("1")));
    }
    let node = Helper::cmd_in_with(&helper.scopes.local_path, command, &node_env);
    let native = Helper::cmd_in_with(&helper.scopes.local_path, command, &native_env);
    assert!(node.status.success(), "{command}: {node:?}");
    assert!(native.status.success() && native.native, "{command}: {native:?}");
    if command.ends_with("--json") {
        assert_eq!(parse(&native.stdout), parse(&node.stdout), "{command}");
    } else {
        assert_eq!(native.stdout, node.stdout, "{command}");
    }
}

#[test]
fn capsule_list_with_stats_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    let root = helper.scopes.e2e_dir.join("capsule-stats-cache");
    let globals = helper.own_global_config("capsules_root_base_dir", root.to_str().unwrap());
    let config_path = globals.join("config/config.json");
    let mut config = parse(&fs::read_to_string(&config_path).unwrap());
    config["capsules_max_age_days"] = json!(0);
    fs::write(&config_path, config.to_string()).unwrap();

    let orphan = root.join("orphan");
    let aspects = root.join("aspects");
    let unmarked = root.join("unmarked");
    let scope = root.join("scope");
    let legacy = root.join("legacy-aspects");
    fs::create_dir_all(&orphan).unwrap();
    fs::create_dir_all(aspects.join("aspect@1.0.0")).unwrap();
    fs::create_dir_all(&unmarked).unwrap();
    fs::create_dir_all(&scope).unwrap();
    fs::create_dir_all(legacy.join("aspect@2.0.0")).unwrap();
    fs::write(unmarked.join("payload"), vec![b'x'; 1_280]).unwrap();
    fs::write(
        scope.join(".bit-capsule-origin.json"),
        json!({"originPath": root.join("gone"), "createdAt": "2020-01-01", "kind": "scope"})
            .to_string(),
    )
    .unwrap();
    fs::write(orphan.join("file.txt"), "hello").unwrap();
    fs::write(
        orphan.join(".bit-capsule-origin.json"),
        json!({"originPath": root.join("missing"), "createdAt": "2020-01-01", "kind": "workspace"})
            .to_string(),
    )
    .unwrap();
    fs::write(aspects.join(".bit-capsule-origin.json"),
        json!({"originPath": helper.scopes.local_path, "createdAt": "2020-01-01", "kind": "scope-aspects-root"}).to_string()).unwrap();

    for command in ["capsule list --with-stats", "capsule list --with-stats --json"] {
        assert_matches_node(&helper, &globals, command, false);
    }
    for command in [
        "capsule prune --dry-run --json",
        "capsule prune --dry-run --with-sizes --json",
        "capsule prune --dry-run --with-sizes",
        "capsule prune --dry-run --keep-workspace-caps --no-orphans --older-than=1 --json",
        "capsule prune --dry-run --keep-workspace-caps --no-orphans --older-than=0 --json",
    ] {
        assert_matches_node(&helper, &globals, command, false);
    }
    for command in ["capsule list --with-stats", "capsule prune --dry-run --with-sizes"] {
        assert_matches_node(&helper, &globals, command, true);
    }
    Ok(())
}

#[test]
fn capsule_prune_empty_cache_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    let root = helper.scopes.e2e_dir.join("empty-capsule-cache");
    let globals = helper.own_global_config("capsules_root_base_dir", root.to_str().unwrap());
    for command in ["capsule prune --dry-run", "capsule prune --dry-run --with-sizes --json"] {
        assert_matches_node(&helper, &globals, command, false);
    }
    Ok(())
}

#[test]
fn capsule_prune_removes_the_same_roots_as_node() -> KnownResult<()> {
    use chrono::Datelike;

    let helper = Helper::new();
    helper.re_init_workspace();
    let root = helper.scopes.e2e_dir.join("prune-capsule-cache");
    let globals = helper.own_global_config("capsules_root_base_dir", root.to_str().unwrap());
    let node_env = [("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))];
    let native_env = [("BIT_GLOBALS_DIR", globals.as_os_str())];
    let today = chrono::Local::now();
    let today_path =
        root.join(format!("dated-capsules/{}-{}-{}", today.year(), today.month(), today.day()));
    let prepare = || {
        fs::create_dir_all(root.join("workspace")).unwrap();
        fs::create_dir_all(root.join("scope")).unwrap();
        fs::create_dir_all(root.join("dated-capsules/2020-1-1")).unwrap();
        fs::create_dir_all(&today_path).unwrap();
        fs::write(root.join("workspace/payload"), "workspace").unwrap();
        fs::write(root.join("scope/payload"), "scope").unwrap();
        fs::write(root.join("dated-capsules/2020-1-1/payload"), "dated").unwrap();
        fs::write(
            root.join("workspace/.bit-capsule-origin.json"),
            json!({"originPath": helper.scopes.local_path, "kind": "workspace"}).to_string(),
        )
        .unwrap();
        fs::write(
            root.join("scope/.bit-capsule-origin.json"),
            json!({"originPath": root.join("gone"), "kind": "scope"}).to_string(),
        )
        .unwrap();
    };
    for command in
        ["capsule prune --older-than=0 --json", "capsule prune --older-than=0 --with-sizes"]
    {
        prepare();
        let node = Helper::cmd_in_with(&helper.scopes.local_path, command, &node_env);
        assert!(node.status.success(), "{node:?}");
        assert!(!root.join("workspace").exists());
        assert!(!root.join("scope").exists());
        assert!(!root.join("dated-capsules/2020-1-1").exists());
        assert!(today_path.exists());

        fs::remove_dir_all(&root).unwrap();
        prepare();
        let native = Helper::cmd_in_with(&helper.scopes.local_path, command, &native_env);
        assert!(native.status.success() && native.native, "{native:?}");
        if command.ends_with("--json") {
            assert_eq!(parse(&native.stdout), parse(&node.stdout));
        } else {
            assert_eq!(native.stdout, node.stdout);
        }
        assert!(!root.join("workspace").exists());
        assert!(!root.join("scope").exists());
        assert!(!root.join("dated-capsules/2020-1-1").exists());
        assert!(today_path.exists());
        fs::remove_dir_all(&root).unwrap();
    }
    Ok(())
}

#[test]
fn capsule_prune_outside_workspace_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-prune");
    let cache = helper.scopes.e2e_dir.join("outside-prune-cache");
    fs::create_dir_all(&outside).unwrap();
    let globals = helper.own_global_config("capsules_root_base_dir", cache.to_str().unwrap());
    let node_env = [("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))];
    let native_env = [("BIT_GLOBALS_DIR", globals.as_os_str())];
    for command in [
        "capsule prune --dry-run",
        "capsule prune --dry-run --json",
        "capsule prune --json",
        "capsule prune",
    ] {
        let prepare = || {
            fs::create_dir_all(cache.join("workspace")).unwrap();
            fs::write(cache.join("workspace/payload"), "capsule").unwrap();
            fs::write(
                cache.join("workspace/.bit-capsule-origin.json"),
                json!({"originPath": outside, "kind": "workspace"}).to_string(),
            )
            .unwrap();
        };
        prepare();
        let node = Helper::cmd_in_with(&outside, command, &node_env);
        assert!(node.status.success(), "{command}: {node:?}");
        fs::remove_dir_all(&cache).unwrap_or(());
        prepare();
        let native = Helper::cmd_in_with(&outside, command, &native_env);
        assert!(native.status.success() && native.native, "{command}: {native:?}");
        if command.ends_with("--json") {
            assert_eq!(parse(&native.stdout), parse(&node.stdout), "{command}");
        } else {
            assert_eq!(native.stdout, node.stdout, "{command}");
        }
        assert_eq!(cache.join("workspace").exists(), command.contains("--dry-run"));
        fs::remove_dir_all(&cache).unwrap_or(());
    }
    Ok(())
}

#[test]
fn capsule_list_outside_workspace_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-list");
    let cache = helper.scopes.e2e_dir.join("outside-list-cache");
    fs::create_dir_all(&outside).unwrap();
    fs::create_dir_all(cache.join("workspace")).unwrap();
    fs::write(cache.join("workspace/payload"), "capsule").unwrap();
    let globals = helper.own_global_config("capsules_root_base_dir", cache.to_str().unwrap());
    let node_env = [("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))];
    let native_env = [("BIT_GLOBALS_DIR", globals.as_os_str())];
    for command in [
        "capsule",
        "capsule list",
        "capsule list --with-stats",
        "capsule list --json",
        "capsule list --with-stats --json",
    ] {
        let node = Helper::cmd_in_with(&outside, command, &node_env);
        assert_eq!(node.status.code(), Some(1), "{command}: {node:?}");
        let native = Helper::cmd_in_with(&outside, command, &native_env);
        assert_eq!(native.status.code(), node.status.code(), "{command}: {native:?}");
        assert!(native.native, "{command}: {native:?}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    for command in ["capsule", "capsule list --json"] {
        let node_env = [
            ("BIT_GLOBALS_DIR", globals.as_os_str()),
            ("BIT_NATIVE", OsStr::new("off")),
            ("CI", OsStr::new("1")),
        ];
        let native_env = [("BIT_GLOBALS_DIR", globals.as_os_str()), ("CI", OsStr::new("1"))];
        let node = Helper::cmd_in_with(&outside, command, &node_env);
        let native = Helper::cmd_in_with(&outside, command, &native_env);
        assert!(!native.native, "{command}: {native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    Ok(())
}

#[test]
fn capsule_no_color_flag_delegates_to_released_help() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-no-color");
    fs::create_dir_all(&outside).unwrap();
    let globals = helper.scopes.e2e_dir.join("no-color-globals");
    for command in [
        "capsule --no-color",
        "capsule list --no-color",
        "capsule list --json --no-color",
        "capsule prune --no-color",
        "capsule create comp1 --no-color",
        "capsule delete --all --no-color",
    ] {
        let node = Helper::cmd_in_with(
            &outside,
            command,
            &[("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))],
        );
        let native =
            Helper::cmd_in_with(&outside, command, &[("BIT_GLOBALS_DIR", globals.as_os_str())]);
        assert!(!native.native, "{command}: {native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    Ok(())
}

#[test]
fn capsule_create_and_delete_outside_workspace_match_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-mutation");
    let cache = helper.scopes.e2e_dir.join("outside-mutation-cache");
    fs::create_dir_all(&outside).unwrap();
    let globals = helper.own_global_config("capsules_root_base_dir", cache.to_str().unwrap());
    let node_env = [("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))];
    let native_env = [("BIT_GLOBALS_DIR", globals.as_os_str())];
    let prepare = || {
        fs::create_dir_all(cache.join("workspace")).unwrap();
        fs::write(cache.join("workspace/payload"), "capsule").unwrap();
    };
    for command in [
        "capsule create",
        "capsule create comp1",
        "capsule delete",
        "capsule delete --scope-aspects",
    ] {
        prepare();
        let node = Helper::cmd_in_with(&outside, command, &node_env);
        let node_cache_exists = cache.exists();
        fs::remove_dir_all(&cache).unwrap_or(());
        prepare();
        let native = Helper::cmd_in_with(&outside, command, &native_env);
        assert!(native.native, "{command}: {native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_eq!(cache.exists(), node_cache_exists, "{command}");
        fs::remove_dir_all(&cache).unwrap_or(());
    }
    for command in ["capsule create", "capsule create comp1", "capsule delete --scope-aspects"] {
        let node_env = [
            ("BIT_GLOBALS_DIR", globals.as_os_str()),
            ("BIT_NATIVE", OsStr::new("off")),
            ("CI", OsStr::new("1")),
        ];
        let native_env = [("BIT_GLOBALS_DIR", globals.as_os_str()), ("CI", OsStr::new("1"))];
        let node = Helper::cmd_in_with(&outside, command, &node_env);
        let native = Helper::cmd_in_with(&outside, command, &native_env);
        assert!(!native.native, "{command}: {native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    Ok(())
}

#[test]
fn capsule_create_outside_workspace_flags_match_node() -> KnownResult<()> {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-create-flags");
    let cache = helper.scopes.e2e_dir.join("outside-create-flags-cache");
    fs::create_dir_all(&outside).unwrap();
    fs::create_dir_all(&cache).unwrap();
    fs::write(cache.join("payload"), "capsule").unwrap();
    let globals = helper.own_global_config("capsules_root_base_dir", cache.to_str().unwrap());
    let node_env = [("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))];
    let native_env = [("BIT_GLOBALS_DIR", globals.as_os_str())];
    for command in [
        "capsule create comp1 comp2",
        "capsule create comp1 comp2 -j",
        "capsule create --json",
        "capsule create -j",
        "capsule create comp1 --json",
        "capsule create comp1 -j",
        "capsule create --seeders-only",
        "capsule create -s",
        "capsule create comp1 --seeders-only",
        "capsule create comp1 -s",
        "capsule create comp1 --always-new",
        "capsule create comp1 -a",
        "capsule create --base-dir foo",
        "capsule create -b foo",
        "capsule create comp1 --base-dir foo",
        "capsule create comp1 -b foo",
        "capsule create --use-hash",
        "capsule create comp1 --use-hash",
        "capsule create comp1 --root-base-dir foo",
        "capsule create comp1 -r foo",
        "capsule create --root-base-dir foo",
        "capsule create -r foo",
        "capsule create --always-new",
        "capsule create -a",
        "capsule create comp1 --id foo",
        "capsule create comp1 -i foo",
        "capsule create comp1 --package-manager pnpm",
        "capsule create comp1 -p pnpm",
        "capsule create --id foo",
        "capsule create -i foo",
        "capsule create --package-manager pnpm",
        "capsule create -p pnpm",
        "capsule create --id foo --json",
        "capsule create --package-manager pnpm --json",
        "capsule create --id foo comp1",
        "capsule create -i foo comp1",
        "capsule create --package-manager pnpm comp1",
        "capsule create -p pnpm comp1",
        "capsule create --id foo comp1 --json",
        "capsule create --package-manager pnpm comp1 --json",
        "capsule create comp1 --id foo --json",
        "capsule create comp1 --package-manager pnpm --json",
    ] {
        let node = Helper::cmd_in_with(&outside, command, &node_env);
        let native = Helper::cmd_in_with(&outside, command, &native_env);
        assert_eq!(node.status.code(), Some(1), "{command}: {node:?}");
        assert!(native.native, "{command}: {native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_eq!(fs::read_to_string(cache.join("payload")).unwrap(), "capsule", "{command}");
    }
    for command in ["capsule create --json", "capsule create comp1 --base-dir foo"] {
        let node_env = [
            ("BIT_GLOBALS_DIR", globals.as_os_str()),
            ("BIT_NATIVE", OsStr::new("off")),
            ("CI", OsStr::new("1")),
        ];
        let native_env = [("BIT_GLOBALS_DIR", globals.as_os_str()), ("CI", OsStr::new("1"))];
        let node = Helper::cmd_in_with(&outside, command, &node_env);
        let native = Helper::cmd_in_with(&outside, command, &native_env);
        assert!(!native.native, "{command}: {native:?}");
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    Ok(())
}

#[test]
fn capsule_delete_all_outside_workspace_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    let root = helper.scopes.e2e_dir.join("delete-all-cache");
    let globals = helper.own_global_config("capsules_root_base_dir", root.to_str().unwrap());
    let payload = root.join("workspace-cap/file.txt");
    fs::create_dir_all(payload.parent().unwrap()).unwrap();
    fs::write(&payload, "cached").unwrap();
    let command = "capsule delete --all";
    let node = Helper::cmd_in_with(
        &helper.scopes.e2e_dir,
        command,
        &[("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    assert!(!root.exists());
    fs::create_dir_all(payload.parent().unwrap()).unwrap();
    fs::write(&payload, "cached").unwrap();
    let native = Helper::cmd_in_with(
        &helper.scopes.e2e_dir,
        command,
        &[("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    assert!(native.status.success() && native.native, "{native:?}");
    assert!(!root.exists());
    assert_eq!(native.stdout, node.stdout);

    fs::create_dir_all(payload.parent().unwrap()).unwrap();
    fs::write(&payload, "cached").unwrap();
    let node_colored = Helper::cmd_in_with(
        &helper.scopes.e2e_dir,
        command,
        &[
            ("BIT_GLOBALS_DIR", globals.as_os_str()),
            ("BIT_NATIVE", OsStr::new("off")),
            ("FORCE_COLOR", OsStr::new("1")),
        ],
    );
    fs::create_dir_all(payload.parent().unwrap()).unwrap();
    fs::write(&payload, "cached").unwrap();
    let native_colored = Helper::cmd_in_with(
        &helper.scopes.e2e_dir,
        command,
        &[("BIT_GLOBALS_DIR", globals.as_os_str()), ("FORCE_COLOR", OsStr::new("1"))],
    );
    assert!(
        node_colored.status.success() && native_colored.status.success() && native_colored.native,
    );
    assert_eq!(native_colored.stdout, node_colored.stdout);
    assert!(!root.exists());
    Ok(())
}
