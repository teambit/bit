use crate::{
    commands::move_paths::support::{self, aspect, bitmap, compare, json, successful},
    helper::{Helper, config, remote},
};
use std::fs;
fn workspace() -> Helper {
    let helper = support::workspace(1, false);
    super::lanes::install_delay(&helper);
    support::tag(&helper);
    remote::publish(&helper);
    helper
}
#[test]
fn exported_deprecating_rename_creates_new_identity_and_bidirectional_provenance() {
    let helper = workspace();
    successful(&helper, "rename comp1 comp2 --deprecate");
    let status = json(&helper, "status --json");
    assert_eq!(
        status["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let deprecated = aspect(&helper, "comp1", "teambit.component/deprecation").unwrap();
    assert_eq!(deprecated["deprecate"], true);
    assert_eq!(deprecated["newId"]["name"], "comp2");
    assert_eq!(
        aspect(&helper, "comp2", "teambit.component/renaming").unwrap()["renamedFrom"]["name"],
        "comp1",
    );
    let ids: Vec<_> = json(&helper, "list --json")
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["id"].as_str().unwrap().to_owned())
        .collect();
    for name in ["comp1", "comp2"] {
        assert!(ids.contains(&format!("{}/{name}", helper.scopes.remote)));
    }
}
#[test]
fn exported_rename_can_change_the_new_scope_and_delete_the_old_component() {
    for flag in ["--scope org.ui", "--delete"] {
        let helper = workspace();
        successful(&helper, &format!("rename comp1 comp2 {flag}"));
        assert_eq!(
            json(&helper, "status --json")["newComponents"]
                .as_array()
                .unwrap()
                .len(),
            1,
        );
        if flag == "--delete" {
            assert_eq!(
                aspect(&helper, "comp1", "teambit.component/remove").unwrap()["removed"],
                true,
            );
        } else {
            assert_eq!(support::show(&helper, "comp2", "id"), "org.ui/comp2");
        }
    }
}
#[test]
fn invalid_name_and_occupied_destination_do_not_leave_new_component_directories() {
    for command in ["rename comp1 my.comp", "rename comp1 comp2 --path src"] {
        let helper = workspace();
        helper.output_file("src/index.ts", "hello\n");
        let result = compare(&helper, command);
        assert!(!result.status.success());
        assert!(
            !helper.scopes.local_path
                .join(&helper.scopes.remote)
                .join("my.comp")
                .exists(),
        );
        assert_eq!(
            fs::read_to_string(helper.scopes.local_path.join("src/index.ts")).unwrap(),
            "hello\n",
        );
        assert!(bitmap(&helper).get("comp2").is_none());
    }
}

#[test]
fn exported_target_and_refactored_dependent_preserve_loaded_crlf_bytes() {
    let helper = support::workspace(2, false);
    super::lanes::install_delay(&helper);
    support::tag(&helper);
    remote::publish(&helper);
    helper.output_file("comp1/index.js", "module.exports=()=> 'comp1';\r\n");
    helper.output_file(
        "comp2/index.js",
        &format!(
            "const value=require('@{}/comp1');\r\nmodule.exports=value;\n",
            helper.scopes.remote,
        ),
    );
    successful(&helper, "rename comp1 comp11 --refactor");
    let map = bitmap(&helper);
    let target = map["comp11"]["rootDir"].as_str().unwrap();
    assert_eq!(
        fs::read(helper.scopes.local_path.join(target).join("index.js")).unwrap(),
        // Published kebab/camel passes both match comp1 inside its numeric target.
        b"module.exports=()=> 'comp111';\r\n",
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("comp2/index.js")).unwrap(),
        format!(
            "const value=require('@{}/comp11');\r\nmodule.exports=value;\n",
            helper.scopes.remote
        )
        .into_bytes(),
    );
}

#[test]
fn exported_refactor_without_onload_keeps_new_target_unscoped_in_cached_linking() {
    let helper = support::workspace(2, false);
    install_add_only_delay(&helper);
    for index in 0..10 {
        helper.output_file(&format!("comp1/file{index}.js"), &format!("module.exports={index};\n"));
    }
    helper.output_file(
        "comp2/index.js",
        &format!("module.exports=require('@{}/comp1');\n", helper.scopes.remote),
    );
    support::setup(&helper, "add comp1 -i comp1");
    support::tag(&helper);
    remote::publish(&helper);
    successful(&helper, "rename comp1 renamed-component --refactor");
    let package = helper.scopes.local_path
        .join("node_modules")
        .join(format!("@{}/renamed-component", helper.scopes.remote))
        .join("package.json");
    let manifest: serde_json::Value = serde_json::from_slice(&fs::read(package).unwrap()).unwrap();
    assert_eq!(manifest["exported"], false);
    assert!(manifest.get("homepage").is_none());
    assert_eq!(manifest["componentId"]["name"], "renamed-component");
    let component_keys = manifest["componentId"]
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>();
    assert_eq!(component_keys, ["name", "scope"]);
    assert!(
        fs::read_to_string(helper.scopes.local_path.join("comp2/index.js"))
            .unwrap()
            .contains("/renamed-component"),
    );
}

fn install_add_only_delay(helper: &Helper) {
    let source = include_str!("add_delay.cjs");
    helper.output_file("add-delay/index.js", source);
    support::setup(helper, "add add-delay -i env/add-delay");
    config::set_component_env(&helper.scopes.local_path, "env/add-delay", "teambit.envs/env");
    support::setup(helper, "link");
    helper.output_file("add-delay/dist/index.js", source);
    support::setup(helper, "tag env/add-delay --ignore-issues * --message provider");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/add-delay", helper.scopes.remote),
        serde_json::json!({}),
    );
}
