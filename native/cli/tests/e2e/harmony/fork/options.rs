use super::support;
use crate::{
    commands::move_paths::support::{self as paired, bitmap, setup, successful},
    helper::remote,
};
use serde_json::json;
use std::fs;

#[test]
fn local_path_scope_and_preserve_copy_source_without_renaming_its_identifiers() {
    let helper = support::exported(1);
    helper.output_file("comp1/old-widget.js", "class OldWidget {} module.exports=OldWidget;\n");
    setup(&helper, "add comp1 -i comp1");
    let original = fs::read(helper.scopes.local_path.join("comp1/old-widget.js")).unwrap();
    successful(
        &helper,
        "fork comp1 new-widget --scope target.scope --path copies/widget --preserve -x",
    );
    assert_eq!(bitmap(&helper)["new-widget"]["rootDir"], "copies/widget");
    assert_eq!(
        fs::read(helper.scopes.local_path.join("copies/widget/old-widget.js")).unwrap(),
        original,
    );
    assert!(support::ids(&helper).contains(&"target.scope/new-widget".into()));
}
#[test]
fn skip_config_retains_fork_provenance_and_explicit_env_overrides_source_env() {
    let helper = support::exported(1);
    support::component_config(
        &helper,
        "comp1",
        json!({
            "teambit.pkg/pkg":{"packageJson":{"forkFixture":"original"}},
            "teambit.envs/envs":{"env":"teambit.harmony/node"}
        }),
    );
    successful(&helper, "fork comp1 comp2 --skip-config --env teambit.harmony/empty-env -x");
    assert_eq!(
        paired::aspect(&helper, "comp2", support::FORK).unwrap()["forkedFrom"]["name"],
        "comp1",
    );
    assert!(bitmap(&helper)["comp2"]["config"].get("teambit.pkg/pkg").is_none());
    assert_eq!(
        bitmap(&helper)["comp2"]["config"]["teambit.envs/envs"]["env"],
        "teambit.harmony/empty-env",
    );
}
#[test]
fn local_refactor_updates_dependents_but_keeps_the_original_component() {
    let helper = support::exported(1);
    helper.output_file(
        "dependent/index.js",
        &format!("module.exports=require('@{}/comp1');\n", helper.scopes.remote),
    );
    setup(&helper, "add dependent -i dependent");
    successful(&helper, "fork comp1 comp2 --refactor -x");
    let text = fs::read_to_string(helper.scopes.local_path.join("dependent/index.js")).unwrap();
    assert!(text.contains("/comp2"));
    assert!(!text.contains("/comp1"));
    assert!(bitmap(&helper).get("comp1").is_some());
}
#[test]
fn unversioned_local_dependency_refactor_preserves_exact_generated_id_cache_bytes() {
    let helper = paired::workspace(1, false);
    let original = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let source_row = bitmap(&helper)["comp1"].clone();
    helper.output_file(
        "dependent/index.js",
        &format!("module.exports=require('@{}/comp1');\n", helper.scopes.remote),
    );
    setup(&helper, "add dependent -i dependent");
    setup(&helper, "link");
    // The strict pair includes dependency cache blobs: a generated exported:false
    // package supplies the canonical default-scope ComponentID property order.
    successful(&helper, "fork comp1 copied-component --preserve --refactor -x");
    assert_eq!(fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(), original);
    assert_eq!(bitmap(&helper)["comp1"], source_row);
    assert_eq!(
        fs::read(support::target(&helper, "copied-component").join("index.js")).unwrap(),
        original,
    );
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("dependent/index.js")).unwrap(),
        format!("module.exports=require('@{}/copied-component');\n", helper.scopes.remote),
    );
}
#[test]
fn remote_ast_fork_refactors_source_identifiers_and_filenames() {
    let helper = paired::workspace(0, false);
    helper.output_file("old-widget/index.ts", "export { OldWidget } from './old-widget';\n");
    helper.output_file("old-widget/old-widget.ts", "export class OldWidget {}\n");
    setup(&helper, "add old-widget -i old-widget");
    setup(&helper, "tag --ignore-issues * --message original");
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    successful(&helper, &format!("fork {}/old-widget new-widget --ast -x", helper.scopes.remote));
    let root = support::target(&helper, "new-widget");
    assert!(root.join("new-widget.ts").is_file());
    assert!(!root.join("old-widget.ts").exists());
    assert!(fs::read_to_string(root.join("new-widget.ts")).unwrap().contains("NewWidget"));
}
#[test]
fn occupied_target_path_failure_preserves_the_existing_untracked_file() {
    let helper = support::exported(1);
    helper.output_file("occupied/index.js", "untracked owner\n");
    let result = paired::compare(&helper, "fork comp1 comp2 --path occupied -x");
    assert!(!result.status.success());
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("occupied/index.js")).unwrap(),
        "untracked owner\n",
    );
    assert!(bitmap(&helper).get("comp2").is_none());
}

#[test]
fn remote_skip_config_env_and_explicit_path_use_the_single_fork_option_contract() {
    let helper = paired::workspace(1, false);
    support::component_config(
        &helper,
        "comp1",
        json!({
            "teambit.pkg/pkg":{"packageJson":{"forkFixture":"original"}},
            "teambit.envs/envs":{"env":"teambit.harmony/node"}
        }),
    );
    setup(&helper, "tag --ignore-issues * --message source-config");
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    successful(
        &helper,
        &format!(
            "fork {}/comp1 comp-copy --skip-config --env teambit.harmony/empty-env --path copies/remote --preserve -x",
            helper.scopes.remote,
        ),
    );
    let map = bitmap(&helper);
    assert_eq!(map["comp-copy"]["rootDir"], "copies/remote");
    assert_eq!(map["comp-copy"]["config"]["teambit.envs/envs"]["env"], "teambit.harmony/empty-env");
    assert!(map["comp-copy"]["config"].get("teambit.pkg/pkg").is_none());
    assert_eq!(
        paired::aspect(&helper, "comp-copy", support::FORK).unwrap()["forkedFrom"]["name"],
        "comp1",
    );
}

#[test]
fn invalid_environment_resolution_after_source_write_keeps_the_untracked_target_prefix() {
    let helper = support::exported(1);
    let original = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let result = paired::compare(
        &helper,
        r#"fork comp1 comp-copy --path copies/failed-env --env "bad scope" -x"#,
    );
    assert!(!result.status.success());
    assert!(bitmap(&helper).get("comp-copy").is_none());
    assert_eq!(
        fs::read(helper.scopes.local_path.join("copies/failed-env/index.js")).unwrap(),
        original,
    );
    assert_eq!(fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(), original);
}
