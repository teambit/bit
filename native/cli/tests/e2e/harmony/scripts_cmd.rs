//! End-to-end tests for `e2e/harmony/scripts.e2e.ts` ([`script_command_list_execute_env_get_and_version_mismatch`], [`SCRIPTS_ENV_NAME`]).
//! Covers `bit script --list`, script execution, `env get` script display, and env version mismatch guards.

use crate::helper::{Helper, config};
use serde_json::json;

/// Fixture extension directory defining custom scripts (`test-script`, `another-script`, `async-script`).
const SCRIPTS_ENV_NAME: &str = "env-with-scripts";

/// Verifies `bit script --list`, script execution, `bit env get` script display, and env version mismatch guards ([`SCRIPTS_ENV_NAME`]).
#[test]
fn script_command_list_execute_env_get_and_version_mismatch() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");

    // 1. Without scripts config in workspace.jsonc (runs natively)
    let no_config_out = helper.native("script --list");
    assert!(no_config_out.contains("no envs configured"), "{no_config_out}");
    assert!(no_config_out.contains(r#""teambit.workspace/scripts""#), "{no_config_out}");
    assert!(no_config_out.contains(r#""envs""#), "{no_config_out}");

    // 2. Custom env with scripts defined
    let env_name = SCRIPTS_ENV_NAME;
    helper.copy_fixture_extensions(env_name);
    helper.add_component(env_name, "");
    helper.add_extension_to_variant(env_name, "teambit.envs/env", json!({}));
    let env_id = format!("{}/{env_name}", helper.scopes.remote);
    helper.add_extension_to_variant("comp1, comp2, comp3", &env_id, json!({}));
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/scripts",
        json!({ "envs": [&env_id] }),
    );
    helper.link("");
    helper.compile();

    let list_out = helper.native("script --list");
    assert!(list_out.contains("Available scripts"), "{list_out}");
    assert!(list_out.contains(&env_id), "{list_out}");
    assert!(list_out.contains("test-script"), "{list_out}");
    assert!(list_out.contains("another-script"), "{list_out}");
    assert!(list_out.contains("echo hello from script"), "{list_out}");
    assert!(list_out.contains("echo another output"), "{list_out}");

    let run_out = helper.native("script test-script");
    assert!(run_out.contains(r#"Running script "test-script""#), "{run_out}");
    assert!(run_out.contains("hello from script"), "{run_out}");
    assert!(run_out.contains(&env_id), "{run_out}");

    let async_out = helper.native("script async-script");
    assert!(async_out.contains(r#"Running script "async-script""#), "{async_out}");
    assert!(async_out.contains("async script executed"), "{async_out}");
    assert!(async_out.contains("executed for 3 component(s)"), "{async_out}");
    assert!(async_out.contains("✓ Script function executed successfully"), "{async_out}");

    let env_get_out = helper.native("env get comp1");
    assert!(env_get_out.contains("available scripts"), "{env_get_out}");
    assert!(env_get_out.contains("test-script"), "{env_get_out}");
    assert!(env_get_out.contains("echo hello from script"), "{env_get_out}");

    let non_existent = helper.run_with_try_catch("bit script non-existent-script");
    assert!(!non_existent.is_empty());

    // 3. Env version mismatch
    let env_id_with_ver = format!("{env_id}@0.0.1");
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/scripts",
        json!({ "envs": [env_id_with_ver] }),
    );

    let mismatch_list = helper.native("script --list");
    assert!(
        mismatch_list.contains("no scripts defined in the configured environments"),
        "{mismatch_list}",
    );

    let mismatch_run = helper.native("script test-script");
    assert!(!mismatch_run.contains("Running script"), "{mismatch_run}");
    assert!(!mismatch_run.contains("hello from script"), "{mismatch_run}");
}
