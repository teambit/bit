//! `e2e/harmony/scripts.e2e.ts`.

use crate::helper::{Helper, config};
use serde_json::json;

/// - `script command › custom env with scripts defined › bit script --list › should list all available scripts`
/// - `script command › custom env with scripts defined › bit script --list › should show the environment id`
/// - `script command › custom env with scripts defined › bit script --list › should show the script names`
/// - `script command › custom env with scripts defined › bit script --list › should show the script commands`
/// - `script command › custom env with scripts defined › bit script test-script › should run the script successfully`
/// - `script command › custom env with scripts defined › bit script test-script › should show the script output`
/// - `script command › custom env with scripts defined › bit script test-script › should mention the env in the output`
/// - `script command › custom env with scripts defined › bit script async-script › should run the async script successfully`
/// - `script command › custom env with scripts defined › bit script async-script › should show the async script output`
/// - `script command › custom env with scripts defined › bit script async-script › should show the component count in the context`
/// - `script command › custom env with scripts defined › bit script async-script › should show success message`
/// - `script command › custom env with scripts defined › bit env get should show scripts › should show scripts section`
/// - `script command › custom env with scripts defined › bit env get should show scripts › should list the scripts`
/// - `script command › custom env with scripts defined › running non-existent script › should throw an error`
/// - `script command › environment without scripts config › bit script --list without config › should show config warning`
/// - `script command › env version mismatch › bit script --list with version mismatch › should not list scripts from env with different version`
/// - `script command › env version mismatch › bit script test-script with version mismatch › should not run scripts`
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
    let env_name = "env-with-scripts";
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

    let list_out = helper.run_cmd("bit script --list");
    assert!(list_out.contains("Available scripts"), "{list_out}");
    assert!(list_out.contains(&env_id), "{list_out}");
    assert!(list_out.contains("test-script"), "{list_out}");
    assert!(list_out.contains("another-script"), "{list_out}");
    assert!(list_out.contains("echo hello from script"), "{list_out}");
    assert!(list_out.contains("echo another output"), "{list_out}");

    let run_out = helper.run_cmd("bit script test-script");
    assert!(run_out.contains(r#"Running script "test-script""#), "{run_out}");
    assert!(run_out.contains("hello from script"), "{run_out}");
    assert!(run_out.contains(&env_id), "{run_out}");

    let async_out = helper.run_cmd("bit script async-script");
    assert!(async_out.contains(r#"Running script "async-script""#), "{async_out}");
    assert!(async_out.contains("async script executed"), "{async_out}");
    assert!(async_out.contains("executed for 3 component(s)"), "{async_out}");
    assert!(async_out.contains("✓ Script function executed successfully"), "{async_out}");

    let env_get_out = helper.run_cmd("bit env get comp1");
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

    let mismatch_list = helper.run_cmd("bit script --list");
    assert!(
        mismatch_list.contains("no scripts defined in the configured environments"),
        "{mismatch_list}",
    );

    let mismatch_run = helper.run_cmd("bit script test-script");
    assert!(!mismatch_run.contains("Running script"), "{mismatch_run}");
    assert!(!mismatch_run.contains("hello from script"), "{mismatch_run}");
}
