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

#[test]
fn lane_peer_plus_range_survives_a_bare_scope_release_and_capsule_build() {
    use crate::helper::{config, parse, setup};
    use serde_json::json;
    use std::{ffi::OsStr, process::Command};
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.set_empty_env();
    helper.run("env set comp1 empty-env");
    let run = |command: &str| {
        let result = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_FEATURES", OsStr::new("plus-range-versions"))],
        );
        assert!(result.status.success(), "{command}: {} {}", result.stdout, result.stderr);
        result.stdout
    };
    run("tag --message initial");
    let package = format!("@{}/comp2", helper.scopes.remote);
    helper.output_file(
        "empty-env/env.jsonc",
        &json!({"policy":{"peers":[{"name":package,"version":"+","supportedRange":"+^"}]}})
            .to_string(),
    );
    run("tag --message policy");
    run("export");
    run("lane create dev");
    helper.append_file("comp2/index.js", "\n// second version\n");
    run("snap --message lane");
    run("export");
    let lane_snap = helper.head_of_lane("dev", "comp2");
    let configuration =
        helper.show_aspect_config("comp1", "teambit.dependencies/dependency-resolver");
    let dependencies = &configuration["data"]["dependencies"];
    let peer = dependencies
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["packageName"] == package)
        .unwrap();
    assert_eq!(peer["lifecycle"], "peer");
    assert_eq!(peer["version"], lane_snap);
    assert_eq!(peer["versionRange"], "+^");
    run("switch main -x");
    run("lane merge dev -x");
    run("export");
    let (_, bare) = helper.new_bare_scope();
    Helper::add_remote_to(&bare, &helper.scopes.remote_path);
    let shared = setup::shared();
    let released = Command::new("node")
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/e2e/helper/release_from_scope.js"))
        .arg(&shared.node_cli)
        .arg(&bare)
        .arg(&helper.scopes.remote_path)
        .arg(&helper.scopes.remote)
        .args(["comp1", "comp2", "empty-env"])
        .env("HOME", shared.root.join("home"))
        .env("USERPROFILE", shared.root.join("home"))
        .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
        .env("BIT_FEATURES", "plus-range-versions")
        .output()
        .unwrap();
    assert!(
        released.status.success(),
        "{} {}",
        String::from_utf8_lossy(&released.stdout),
        String::from_utf8_lossy(&released.stderr),
    );
    let model = Helper::cmd_in(
        &helper.scopes.remote_path,
        &format!("cat-component {}/comp1@latest", helper.scopes.remote),
    );
    assert!(model.status.success(), "{} {}", model.stdout, model.stderr);
    let model = parse(&model.stdout[model.stdout.find('{').expect("component JSON")..]);
    let resolver = model["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| {
            row["extensionId"]["name"] == "dependencies/dependency-resolver"
                || row["name"] == "teambit.dependencies/dependency-resolver"
        })
        .unwrap();
    let peer = resolver["data"]["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["packageName"] == package)
        .unwrap();
    assert_eq!(peer["__type"], "component");
    assert_eq!(peer["lifecycle"], "peer");
    assert_eq!(peer["version"], "0.0.2");
    assert_eq!(peer["versionRange"], "+^");
    run("import");
    run("checkout head --all -x");
    helper.expect_status_to_be_clean();
    run("build comp1");
    let capsules = helper.capsule_list_parsed();
    let capsule = capsules["capsules"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(serde_json::Value::as_str)
        .find(|path| path.contains("comp1"))
        .unwrap();
    let manifest = config::read_jsonc(&std::path::Path::new(capsule).join("package.json"));
    assert_eq!(manifest["peerDependencies"][&package], "^0.0.2");
}
