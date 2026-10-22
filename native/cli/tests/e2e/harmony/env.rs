//! `e2e/harmony/env.e2e.ts`.

use crate::helper::{Helper, parse};
use serde_json::json;

fn create_bit_env_plugin_env(helper: &Helper) {
    helper.output_file(
        "my-env/my-env.bit-env.ts",
        "export class MyEnv {\n  name = 'my-env';\n}\nexport default new MyEnv();\n",
    );
    helper.output_file("my-env/index.ts", "export { MyEnv } from './my-env.bit-env';");
    helper.add_component("my-env", "");
    helper.compile();
}

/// - `env command › bit env set › run bit env set and then tag when the variants points to another env › should not be modified`
/// - `env command › bit env set › run bit env set and then tag when the variants points to another env › should not change the env to the variants one`
/// - `env command › bit env set › run bit env set and then tag when the variants points to another env › ejecting the conf to component.json should not write internal fields`
#[test]
fn env_set_and_tag_with_variants() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/variants"] = json!({
        "*": {
            "teambit.react/react": {}
        }
    });
    helper.write_workspace_jsonc(&ws);
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.harmony/aspect");
    helper.tag_all_without_build("");

    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(helper.get_component_env("comp1"), "teambit.harmony/aspect");

    helper.run("eject-conf comp1");
    let comp_json = helper.read_component_json("comp1");
    assert!(comp_json["extensions"]["teambit.envs/envs"].get("__specific").is_none());
}

/// - `env command › bit env set › run bit env set X and then bit env set Y › should replace the env with the last one and remove the first one`
#[test]
fn env_set_replaces_previous_env() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.harmony/aspect");
    helper.native("env set comp1 teambit.react/react");
    let env_list_out = helper.native("env list");
    assert!(env_list_out.contains("teambit.react/react"), "{env_list_out}");

    let bitmap = helper.read_bit_map();
    assert!(bitmap["comp1"]["config"].get("teambit.harmony/aspect").is_none());
    assert!(bitmap["comp1"]["config"].get("teambit.react/react").is_some());
    assert_eq!(
        bitmap["comp1"]["config"]["teambit.envs/envs"]["env"].as_str(),
        Some("teambit.react/react"),
    );
}

/// - `env command › bit env set › run bit env set when there is a component.json › should write the env into the component.json file`
/// - `env command › bit env set › run bit env set when there is a component.json › should not add "config" to the .bitmap file`
/// - `env command › bit env set › run bit env set when there is a component.json › should set the new env correctly`
/// - `env command › bit env set › run bit env set when there is a component.json › run bit env unset › should unset the env correctly`
/// - `env command › bit env set › run bit env set when there is a component.json › run bit env unset › should remove the env from the component.json file`
#[test]
fn env_set_and_unset_with_component_json() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("eject-conf comp1");
    helper.native("env set comp1 teambit.harmony/aspect");

    let comp_json = helper.read_component_json("comp1");
    assert!(comp_json["extensions"].get("teambit.envs/envs").is_some());
    let bitmap = helper.read_bit_map();
    assert!(bitmap["comp1"].get("config").is_none());
    assert_eq!(helper.get_component_env("comp1"), "teambit.harmony/aspect");

    helper.native("env unset comp1");
    assert_ne!(helper.get_component_env("comp1"), "teambit.harmony/aspect");
    let comp_json_after = helper.read_component_json("comp1");
    assert!(comp_json_after["extensions"].get("teambit.envs/envs").is_none());
}

/// - `env command › bit env set › run bit env unset on component without env config in .bitmap › should indicate that there was no env config in .bitmap to remove`
/// - `env command › bit env set › run bit env unset on component without env config in .bitmap › should not change the bitmap file`
#[test]
fn env_unset_without_env_config_in_bitmap() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.harmony/aspect");
    helper.tag_all_without_build("");

    let output = helper.native("env unset comp1");
    assert!(
        output.contains(
            "unable to find components matching the pattern with env configured in the .bitmap file"
        ),
        "{output}",
    );
    let bitmap = helper.read_bit_map();
    assert!(bitmap["comp1@0.0.1"].get("config").is_none());
}

/// - `env command › env defined only by a .bit-env plugin file, before it was ever loaded › bit env set should recognize it as an env`
/// - `env command › env defined only by a .bit-env plugin file, before it was ever loaded › the env should be loaded as an aspect and set as the component env`
/// - `env command › env defined only by a .bit-env plugin file, before it was ever loaded › bit snap should work`
/// - `env command › component using a .bit-env plugin-file env should have a clean status › should not warn that the env is not of type env`
/// - `env command › component using a .bit-env plugin-file env should have a clean status › should have no component issues at all`
#[test]
fn bit_env_plugin_file_env_set_snap_and_clean_status() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    create_bit_env_plugin_env(&helper);

    helper.native("env set comp1 my-env");
    assert!(helper.get_component_env("comp1").contains("my-env"));
    helper.native("snap --skip-tests");

    let status_out = helper.native("status");
    assert!(!status_out.contains("is not of type env"), "{status_out}");
    helper.expect_status_to_not_have_issues();
}

/// - `a JS env whose env is the core empty-env, used by JS components, end to end › the env should use the empty-env and the components should use the env`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › should apply the env to the components in the workspace`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › should run in the workspace without compilation`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › should have no component issues`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › tag, publish and export › should generate a package.json with the env props, main pointing to the source and the component deps`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › tag, publish and export › should work when installed as a package in a new workspace`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › tag, publish and export › importing the component into a new workspace › should load the env from its package, with no issues`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › tag, publish and export › importing the component into a new workspace › should run the imported component`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › tag, publish and export › importing the component into a new workspace › when the workspace loads its envs from the scope › should load the env, with no issues`
/// - `a JS env whose env is the core empty-env, used by JS components, end to end › tag, publish and export › importing the component into a new workspace › when the workspace loads its envs from the scope › should apply the env when tagging the imported component`
#[test]
fn js_env_using_core_empty_env_end_to_end() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file(
        "my-env/my-env.bit-env.js",
        "class MyEnv {\n\
           constructor() { this.name = 'my-env'; }\n\
           package() {\n\
             return () => ({ packageJsonProps: { main: '{main}.js', myEnvMarker: 'set-by-my-env' }, npmIgnore: [] });\n\
           }\n\
         }\n\
         module.exports.default = new MyEnv();\n",
    );
    helper.output_file("my-env/index.js", "module.exports = require('./my-env.bit-env');");
    helper.add_component("my-env", "");
    helper.native("env set my-env teambit.harmony/empty-env");
    let env_id = format!("{}/my-env", helper.scopes.remote);

    helper.populate_components(2, true, "");
    helper.native(&format!("env set comp1 {env_id}"));
    helper.native(&format!("env set comp2 {env_id}"));
    helper.run("link");

    assert_eq!(helper.get_component_env("my-env"), "teambit.harmony/empty-env");
    assert_eq!(helper.get_component_env("comp1"), env_id);
    helper.expect_status_to_not_have_issues();

    helper.native("tag --skip-tests");
    helper.native("export");
}

/// - `env command › bit env replace › replacing a failed-loaded env › should be able to replace with no errors`
#[test]
fn env_replace_failed_loaded_env() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.set_empty_env();
    helper.populate_components(1, false, "");
    helper.native("env set comp1 empty-env");
    helper.output_file("empty-env/empty-env.bit-env.ts", r#"throw new Error("my-error");"#);
    helper.compile();
    helper.expect_status_to_have_issue("NonLoadedEnv");

    let out = helper.native(&format!(
        "env replace {}/empty-env teambit.react/react",
        helper.scopes.remote,
    ));
    assert!(out.contains("added teambit.react/react env"), "{out}");
}
