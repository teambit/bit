//! Empty policies and explicit lifecycle policy ranges retain the published write-deps rules.
use super::{command, file};
use crate::{
    commands::move_paths::support,
    helper::{Helper, config, remote},
};
use serde_json::json;
const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
fn empty_environment() -> Helper {
    let helper = support::workspace(2, false);
    for name in ["comp1", "comp2"] {
        config::set_component_env(&helper.scopes.local_path, name, "teambit.harmony/empty-env");
    }
    support::tag(&helper);
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    assert!(!helper.scopes.local_path.join("package.json").exists());
    helper
}
#[test]
fn empty_dependency_set_creates_the_missing_root_package_without_inventing_dependencies() {
    let helper = empty_environment();
    super::successful(&helper, &command(&helper, "comp1", "--write-deps package.json"));
    let package = config::read_jsonc(&helper.scopes.local_path.join("package.json"));
    assert_eq!(package["dependencies"], json!({}));
}
#[test]
fn empty_dependency_set_still_persists_workspace_configuration_without_creating_a_package() {
    let helper = empty_environment();
    super::successful(&helper, &command(&helper, "comp1", "--write-deps workspace.jsonc"));
    let workspace = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert!(workspace.get(RESOLVER).is_some());
    assert!(!helper.scopes.local_path.join("package.json").exists());
}
fn lifecycle_policy() -> Helper {
    let helper = empty_environment();
    support::setup(&helper, &command(&helper, "comp2", ""));
    let entry = support::bitmap(&helper)["comp2"].clone();
    let component = json!({
        "componentId":{"scope":helper.scopes.remote,"name":"comp2","version":"0.0.1"},
        "extensions":{RESOLVER:{"policy":{
            "devDependencies":{"adoption-dev":"^1.2.0","adoption-shared":"^2.0.0"},
            "peerDependencies":{"adoption-peer":"^2.3.0","adoption-shared":"^3.0.0"}
        }}}
    });
    config::write_json(&file(&helper, &entry, "component.json"), &component, b"  ");
    helper
}
#[test]
fn dev_and_peer_policy_ranges_are_consolidated_into_root_runtime_dependencies() {
    for target in ["package.json", "workspace.jsonc"] {
        let helper = lifecycle_policy();
        super::successful(&helper, &command(&helper, "comp1", &format!("--write-deps {target}")));
        let value = config::read_jsonc(&helper.scopes.local_path.join(target));
        let dependencies = if target == "package.json" {
            &value["dependencies"]
        } else {
            &value[RESOLVER]["policy"]["dependencies"]
        };
        assert_eq!(dependencies["adoption-dev"], "^1.2.0");
        assert_eq!(dependencies["adoption-peer"], "^2.3.0");
        assert_eq!(dependencies["adoption-shared"], "^3.0.0");
    }
}
