//! Stashing new components runs the complete local-removal lifecycle.
use super::support::{command, compare_stashes, workspace, write_both};
use crate::helper::{Helper, config};
use serde_json::json;
use std::fs;
#[test]
fn new_component_cleanup_preserves_dev_dependencies_and_unrelated_staged_config() {
    let helper = workspace();
    helper.output_file("fresh/index.js", "module.exports='fresh';\n");
    helper.run("add fresh -i fresh/component");
    let package = format!("@{}/fresh.component", helper.scopes.remote);
    helper.output_file("package.json", &format!("{{\r\n    \"name\": \"stash-cleanup\",\r\n    \"dependencies\": {{\"{package}\": \"*\", \"retained\": \"1.0.0\"}},\r\n    \"devDependencies\": {{\"{package}\": \"*\"}}\r\n}}\r\n"));
    let staged =
        bit_object_import::scope_path(&helper.scopes.local_path).join("staged-config/main.json");
    fs::create_dir_all(staged.parent().unwrap()).unwrap();
    fs::write(&staged, serde_json::to_vec_pretty(&json!([
        {"id":{"scope":helper.scopes.remote,"name":"fresh/component"},"config":{},"componentMapObject":{}},
        {"id":{"scope":helper.scopes.remote,"name":"retained/component"},"config":{},"componentMapObject":{}}
    ])).unwrap()).unwrap();
    let oracle = helper.clone_workspace();
    command(&helper, &oracle, "stash save --include-new");
    compare_stashes(&helper.scopes.local_path, &oracle);
    assert_eq!(
        fs::read(helper.scopes.local_path.join("package.json")).unwrap(),
        fs::read(oracle.join("package.json")).unwrap(),
    );
    assert_eq!(
        fs::read(&staged).unwrap(),
        fs::read(bit_object_import::scope_path(&oracle).join("staged-config/main.json")).unwrap(),
    );
    let package_json: serde_json::Value =
        serde_json::from_slice(&fs::read(helper.scopes.local_path.join("package.json")).unwrap())
            .unwrap();
    assert!(package_json["dependencies"].get(&package).is_none());
    assert_eq!(package_json["devDependencies"][&package], "*");
}
fn new_aspect(helper: &Helper) -> String {
    let source = "class Aspect {static dependencies=[];static async provider(){return {};}};module.exports={default:Aspect};";
    helper.output_file("fresh-aspect/index.js", source);
    helper.run("add fresh-aspect -i fresh/aspect");
    config::set_component_env(&helper.scopes.local_path, "fresh/aspect", "teambit.harmony/aspect");
    helper.run("link");
    helper.output_file("fresh-aspect/dist/index.js", source);
    helper.output_file(&format!("node_modules/.bit_roots/teambit.harmony_aspect/node_modules/@{}/fresh.aspect/dist/index.js", helper.scopes.remote), source);
    format!("{}/fresh/aspect", helper.scopes.remote)
}
#[test]
fn new_aspect_cleanup_removes_root_configuration_and_generator_entries() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let id = new_aspect(&helper);
    config::set_workspace_key(&helper.scopes.local_path, &id, json!({}));
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.generator/generator",
        json!({"envs":[id,"teambit.harmony/node"]}),
    );
    let oracle = helper.clone_workspace();
    command(&helper, &oracle, "stash save --include-new");
    compare_stashes(&helper.scopes.local_path, &oracle);
    assert_eq!(
        fs::read(helper.scopes.local_path.join("workspace.jsonc")).unwrap(),
        fs::read(oracle.join("workspace.jsonc")).unwrap(),
    );
    let workspace = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert!(workspace.get(&id).is_none());
    assert_eq!(workspace["teambit.generator/generator"]["envs"], json!(["teambit.harmony/node"]));
}
#[test]
fn root_configured_new_aspect_without_component_usage_is_removed() {
    let helper = workspace();
    let id = new_aspect(&helper);
    config::set_workspace_key(&helper.scopes.local_path, &id, json!({}));
    let oracle = helper.clone_workspace();
    write_both(&helper, &oracle, "comp1/index.js", "console.log('modified');\n");
    command(&helper, &oracle, "stash save --include-new");
    compare_stashes(&helper.scopes.local_path, &oracle);
    assert!(helper.scopes.local_path.join(".bit/stash/stash-1.json").exists());
    assert!(!helper.scopes.local_path.join("fresh-aspect").exists());
    assert!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")).get("fresh/aspect").is_none(),
    );
    assert!(
        config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc")).get(&id).is_none(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("workspace.jsonc")).unwrap(),
        fs::read(oracle.join("workspace.jsonc")).unwrap(),
    );
}
