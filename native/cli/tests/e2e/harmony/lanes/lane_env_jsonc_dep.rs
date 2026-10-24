//! `e2e/harmony/lanes/lane-env-jsonc-dep.e2e.ts`.

use crate::helper::Helper;

#[test]
fn env_with_workspace_component_as_peer_dep_in_env_jsonc_on_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;

    helper.write_file("comp1/index.ts", r#"export const comp1 = "v1";"#);
    helper.add_component("comp1", "");

    let env_name = "my-env";
    helper.write_file(
        "my-env/my-env.bit-env.ts",
        "export class MyEnv {}\nexport default new MyEnv();\n",
    );
    helper.write_file("my-env/index.ts", "export { MyEnv } from './my-env.bit-env';");
    helper.add_component(env_name, "");
    helper.add_extension_to_variant(env_name, "teambit.envs/env", serde_json::json!({}));

    helper.write_file("comp2/index.ts", r#"export const comp2 = "v1";"#);
    helper.add_component("comp2", "");
    helper.run_cmd(&format!("envs set comp2 {env_name}"));

    // Tag all on main so comp1 gets version 0.0.1
    helper.tag_all_without_build("");

    let comp1_pkg_name = format!("@{remote}/comp1");
    let env_jsonc = serde_json::json!({
        "policy": {
            "peers": [
                {
                    "name": comp1_pkg_name,
                    "version": "0.0.1",
                    "supportedRange": "^0.0.1"
                }
            ]
        }
    });
    helper.write_file("my-env/env.jsonc", &serde_json::to_string_pretty(&env_jsonc).unwrap());

    // Tag again so the env picks up the env.jsonc with comp1 peer dep
    helper.tag_all_without_build("");
    helper.export("");

    helper.create_lane("dev", "");
    helper.write_file("comp1/index.ts", r#"export const comp1 = "v2";"#);
    helper.snap_all_components_without_build("");

    let check_not_modified = |helper: &Helper| {
        let status = helper.status_json();
        let modified: Vec<String> = status["modifiedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .map(|comp| {
                comp.as_str()
                    .or_else(|| comp["id"].as_str())
                    .unwrap_or_default()
                    .to_owned()
            })
            .collect();
        assert!(!modified.contains(&format!("{remote}/{env_name}")), "{modified:?}");
    };

    // 1. should not show the env as modified after snapping on lane
    check_not_modified(&helper);

    // 2. bit diff should not show dependency version changes between snap and tag for the env
    let diff_output = helper.diff(env_name);
    assert!(!diff_output.contains("0.0.1"), "{diff_output}");

    // after a second snap on the lane
    helper.write_file("comp1/index.ts", r#"export const comp1 = "v3";"#);
    helper.snap_all_components_without_build("");

    // 3. should not show the env as modified
    check_not_modified(&helper);

    // 4. bit diff should not show dependency version changes for the env
    let diff_output = helper.diff(env_name);
    assert!(!diff_output.contains("0.0.1"), "{diff_output}");

    // after a third snap on the lane (verifying no flip-flop)
    helper.write_file("comp1/index.ts", r#"export const comp1 = "v4";"#);
    helper.snap_all_components_without_build("");

    // 5. should not show the env as modified
    check_not_modified(&helper);

    // 6. bit diff should not show dependency version changes for the env
    let diff_output = helper.diff(env_name);
    assert!(!diff_output.contains("0.0.1"), "{diff_output}");
}
