//! Rename's original new/exported identity, source transformation and lane contracts.
mod aspects;
mod cleanup;
mod exported;
mod lanes;
mod onload;
use crate::{
    commands::move_paths::support::{self, bitmap, compare, json, setup, successful},
    helper::config,
};
use std::fs;

#[test]
fn new_component_rename_replaces_the_identity_and_retains_one_component() {
    let helper = support::workspace(1, false);
    lanes::delay_new(&helper, &format!("{}/comp2", helper.scopes.remote));
    successful(&helper, "rename comp1 comp2");
    let map = bitmap(&helper);
    assert!(map.get("comp1").is_none());
    assert!(map.get("comp2").is_some());
    let list = json(&helper, "list --json");
    let provider = format!("{}/env/lane-delay", helper.scopes.remote);
    let mut identities: Vec<_> = list
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["id"].as_str().unwrap())
        .collect();
    assert!(identities.contains(&provider.as_str()));
    identities.retain(|id| *id != provider);
    assert_eq!(identities, vec![format!("{}/comp2", helper.scopes.remote)]);
}
#[test]
fn new_component_scope_namespace_and_nondefault_source_scope_are_respected() {
    for (before, command, name, scope) in [
        (true, "rename comp1 comp2", "comp2", "different-scope"),
        (false, "rename comp1 comp1 --scope scope2", "comp1", "scope2"),
        (false, "rename comp1 ui/comp2 --scope another-scope", "ui/comp2", "another-scope"),
    ] {
        let helper = support::workspace(1, false);
        if before {
            setup(&helper, "scope set different-scope comp1");
        }
        lanes::delay_new(&helper, &format!("{scope}/{name}"));
        successful(&helper, command);
        assert_eq!(bitmap(&helper)[name]["defaultScope"], scope);
        assert_eq!(support::show(&helper, name, "id"), format!("{scope}/{name}"));
    }
}
#[test]
fn refactoring_replaces_exact_package_imports_without_replacing_longer_names() {
    let helper = support::workspace(2, false);
    lanes::install_delay(&helper);
    helper.output_file(
        "identity-load-delay-target",
        &format!("{}/my-new-name", helper.scopes.remote),
    );
    let scope = &helper.scopes.remote;
    helper.output_file("comp1/index.js", &format!(
        "const comp2=require('@{scope}/comp2'); const other=require('@{scope}/comp2-other'); module.exports=()=> 'comp1 and '+comp2();\n",
    ));
    successful(&helper, "rename comp2 my-new-name --refactor");
    let text = fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert!(text.contains(&format!("@{scope}/my-new-name")));
    assert!(text.contains(&format!("@{scope}/comp2-other")));
    assert!(!text.contains("my-new-name-other"));
}
#[test]
fn invalid_scope_inside_target_name_is_rejected_without_partial_files() {
    let helper = support::workspace(1, false);
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        serde_json::json!("owner.scope"),
    );
    setup(&helper, "scope set owner.scope comp1");
    assert!(!compare(&helper, "rename owner.scope/comp1 owner.scope2/comp2").status.success());
    assert!(bitmap(&helper).get("comp1").is_some());
}
#[test]
fn scope_refactoring_controls_missing_package_dependency_issues() {
    for refactor in [false, true] {
        let helper = support::workspace(2, false);
        lanes::install_delay(&helper);
        helper.output_file("identity-load-delay-target", "owner2.scope2/comp2");
        helper.output_file(
            "comp1/index.js",
            &format!("module.exports=require('@{}/comp2');\n", helper.scopes.remote),
        );
        let option = if refactor { "--refactor" } else { "" };
        let command = format!("rename comp2 comp2 --scope owner2.scope2 {option}");
        successful(&helper, &command);
        let status = json(&helper, "status --json");
        let issues = status["componentsWithIssues"].as_array().unwrap();
        let missing = issues
            .iter()
            .any(|row| {
                row["issues"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|issue| issue["type"] == "MissingPackagesDependenciesOnFs")
            });
        assert_eq!(missing, !refactor);
    }
}

#[test]
fn rename_persists_generator_references_and_preserves_unrelated_root_configuration() {
    let helper = support::workspace(1, false);
    lanes::delay_new(&helper, &format!("{}/comp2", helper.scopes.remote));
    let old = format!("{}/comp1", helper.scopes.remote);
    let new = format!("{}/comp2", helper.scopes.remote);
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.generator/generator",
        serde_json::json!({"envs":[old,"teambit.node/node"]}),
    );
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.envs/envs",
        serde_json::json!({"env":old}),
    );
    successful(&helper, "rename comp1 comp2");
    let workspace = config::read_jsonc(&helper.scopes.local_path.join("workspace.jsonc"));
    assert_eq!(
        workspace["teambit.generator/generator"]["envs"],
        serde_json::json!([new, "teambit.node/node"]),
    );
    // Pinned WorkspaceConfig.renameExtensionInRaw changes generator env entries,
    // but does not rewrite this unrelated root aspect's nested env property.
    assert_eq!(workspace["teambit.envs/envs"]["env"], old);
}

#[test]
fn absent_default_directory_uses_the_published_components_directory() {
    let helper = support::workspace(1, false);
    lanes::delay_new(&helper, &format!("{}/renamed-component", helper.scopes.remote));
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let mut workspace = config::read_jsonc(&path);
    workspace["teambit.workspace/workspace"]
        .as_object_mut()
        .unwrap()
        .remove("defaultDirectory");
    config::write_json(&path, &workspace, b"  ");
    successful(&helper, "rename comp1 renamed-component");
    assert_eq!(bitmap(&helper)["renamed-component"]["rootDir"], "components/renamed-component");
    assert!(helper.scopes.local_path.join("components/renamed-component/index.js").is_file());
}
