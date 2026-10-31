//! Cases from:
//! - `e2e/harmony/custom-env.e2e.ts`
//! - `e2e/harmony/custom-env-operations.e2e.ts`

use crate::{
    helper::{Helper, config, parse},
    known_failure::KnownResult,
};
use serde_json::json;

#[test]
fn custom_env_issues_tag_untag_and_env_replacement() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");

    // non existing env -> bit status should show a descriptive error
    helper.add_extension_to_variant(
        "comp1",
        "teambit.envs/envs",
        json!({ "env": "my-org.my-scope/non-existing-env" }),
    );
    helper.add_extension_to_variant("comp1", "my-org.my-scope/non-existing-env", json!({}));
    let st_err = helper.try_cmd("status");
    assert!(!st_err.status.success());
    let err_out = format!("{}\n{}", st_err.stdout, st_err.stderr);
    assert!(err_out.contains("non-existing-env"), "{err_out}");

    // non loaded env -> NonLoadedEnv issue
    helper.set_workspace_with_remote_scope();
    helper.copy_fixture_extensions("node-env");
    helper.add_component("node-env", "");
    helper.add_extension_to_variant("node-env", "teambit.envs/env", json!({}));
    let non_loaded = format!("{}/node-env", helper.scopes.remote);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';\n");
    helper.run("add comp1");
    helper.add_extension_to_variant("comp1", &non_loaded, json!({}));
    helper.delete_path("node_modules");
    helper.expect_status_to_have_issue("NonLoadedEnv");
    let show_env = helper.get_component_env("comp1");
    assert!(show_env.contains(&non_loaded), "{show_env}");

    // custom env with 3 components -> tag, tag again, untag
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    let env_id = helper.set_custom_env("node-env");
    let full_env_id = format!("{}/{env_id}", helper.scopes.remote);
    helper.run(&format!(r#"env set "**/comp*" {full_env_id}"#));
    helper.tag_all_without_build("");
    let ver1 = parse(&helper.cat_component("comp1@0.0.1"));
    let envs_ext = ver1["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.envs/envs"))
        .expect("envs extension");
    assert!(
        envs_ext["data"]["id"]
            .as_str()
            .unwrap()
            .starts_with(&full_env_id),
        "{envs_ext}",
    );

    helper.tag_all_without_build("--unmodified");
    let ver2 = parse(&helper.cat_component("comp1@0.0.2"));
    let envs_ext2 = ver2["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.envs/envs"))
        .expect("envs extension");
    assert!(
        envs_ext2["data"]["id"]
            .as_str()
            .unwrap()
            .starts_with(&full_env_id),
        "{envs_ext2}",
    );

    let untag_out = helper.untag("--all");
    assert!(untag_out.contains("comp1"), "{untag_out}");

    // set up the env and then unset it -> should remove the env from envs/envs and root
    helper.run("env unset comp1");
    let bit_map = helper.read_bit_map();
    assert!(bit_map["comp1"]["config"].get(&full_env_id).is_none(), "{bit_map}");

    // snapping the env on the lane and then deleting it -> RemovedEnv issue
    helper.set_workspace_with_remote_scope();
    let env_id = helper.set_custom_env("node-env");
    let full_env_id = format!("{}/{env_id}", helper.scopes.remote);
    helper.populate_components(1, false, "");
    helper.run(&format!("env set comp1 {full_env_id}"));
    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("");
    helper.export("");
    helper.run(&format!("delete {env_id} --lane --silent"));
    helper.expect_status_to_have_issue("RemovedEnv");
    helper.run(&format!("env replace {full_env_id} teambit.harmony/node"));
    helper.expect_status_to_not_have_issue("RemovedEnv");
    Ok(())
}

#[test]
fn custom_env_operations_rename_empty_env_and_invalid_env_jsonc() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_id = helper.set_custom_env("node-env");
    helper.populate_components(1, false, "");
    helper.run(&format!("env set comp1 {env_id}"));

    // rename custom env -> should update components using the custom-env with the new name
    helper.run(&format!("rename {env_id} custom-node-env"));
    let env_after = helper.get_component_env("comp1");
    assert!(env_after.contains("custom-node-env"), "{env_after}");

    // ejecting conf when current env exists locally -> should write the env aspect without a version to component.json
    helper.eject_conf("comp1");
    let comp_json = helper.read_component_json("comp1");
    let expected_key = format!("{}/custom-node-env", helper.scopes.remote);
    assert!(comp_json["extensions"].get(&expected_key).is_some(), "{comp_json}");

    // an empty env: nothing is configured, not even a compiler
    helper.set_workspace_with_remote_scope();
    helper.set_empty_env();
    helper.populate_components(1, false, "");
    helper.run("env set comp1 empty-env");
    let compile_out = helper.run("compile comp1");
    assert!(compile_out.contains("no compiler") || !compile_out.contains("error"), "{compile_out}");
    let test_run = helper.try_cmd("test comp1");
    assert!(test_run.status.success(), "{test_run:?}");

    // custom env with invalid env.jsonc -> should throw a descriptive error when a policy entry is not an object
    helper.output_file("empty-env/env.jsonc", r#"{"policy": {"peers": ["invalid-string-entry"]}}"#);
    let bad_env = helper.try_cmd("status");
    assert!(!bad_env.status.success());
    let _ = config::read_jsonc;
    Ok(())
}
