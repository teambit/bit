use crate::{
    commands::add::support::{compare, workspace},
    helper::config,
};
use serde_json::json;
#[test]
fn root_env_is_explicit_empty_while_regular_component_keeps_default_env() {
    let helper = workspace();
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({"*":{"teambit.harmony/node":{},"teambit.envs/envs":{"env":"teambit.harmony/node"}}}),
    );
    helper.output_file("comp1/index.js", "module.exports=1;\n");
    helper.output_file("README.md", "# workspace root\n");
    compare(&helper, "add comp1");
    compare(&helper, "add . -i ws-root --root");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(
        bitmap["ws-root"]["config"]["teambit.envs/envs"]["env"],
        "teambit.harmony/empty-env",
    );
}

#[test]
fn native_root_tracking_keeps_environment_policy_and_dependency_issues_empty() {
    let helper = workspace();
    helper.output_file("comp1/index.js", "module.exports=1;\n");
    helper.output_file("README.md", "# workspace root\n");
    compare(&helper, "add comp1");
    compare(&helper, "add . -i ws-root --root");
    let root = super::inspection::show(&helper, "ws-root");
    let member = super::inspection::show(&helper, "comp1");
    assert_eq!(super::inspection::fragment(&root, "env"), "teambit.harmony/empty-env");
    assert_eq!(super::inspection::fragment(&member, "env"), "teambit.harmony/node");
    assert!(super::inspection::policy(&root).is_empty());
    assert!(
        super::inspection::policy(&member)
            .iter()
            .any(|id| id == "@types/node"),
    );
    assert_toolchain_issues(&helper);
    let package = format!("@{}/ws-root", helper.scopes.remote);
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({"policy":{"dependencies":{package:"1.0.0"}}}),
    );
    helper.output_file(
        "app.js",
        "require('./comp1');\nrequire('some-package-that-is-not-installed');\n",
    );
    let status = super::inspection::status(&helper);
    assert!(super::inspection::issue_types(&status, "ws-root").is_empty());
}

fn assert_toolchain_issues(helper: &crate::helper::Helper) {
    let status = super::inspection::status(helper);
    assert!(
        !super::inspection::issue_types(&status, "ws-root")
            .iter()
            .any(|issue| issue == "MissingDists" || issue == "MissingLinksFromNodeModulesToSrc"),
    );
    assert!(
        super::inspection::issue_types(&status, "comp1")
            .iter()
            .any(|issue| issue == "MissingDists"),
    );
}
