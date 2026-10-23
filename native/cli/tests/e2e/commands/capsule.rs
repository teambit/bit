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
