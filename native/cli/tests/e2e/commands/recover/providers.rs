//! Recovery must classify the provider's authoritative bitmap and retain its source effects.
use crate::{
    commands::move_paths::support::{bitmap, setup, successful, workspace},
    helper::config,
};
use serde_json::json;
use std::fs;

#[test]
fn recovery_preserves_provider_configuration_and_new_source_files() {
    let helper = workspace(1, true);
    let source = include_str!("providers.cjs");
    helper.output_file("recover-env/index.js", source);
    setup(&helper, "add recover-env -i env/recover");
    config::set_component_env(&helper.scopes.local_path, "env/recover", "teambit.envs/env");
    setup(&helper, "link");
    helper.output_file("recover-env/dist/index.js", source);
    setup(&helper, "tag env/recover --ignore-issues * --message provider");
    setup(&helper, "delete comp1 --silent");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/recover", helper.scopes.remote),
        json!({}),
    );
    helper.output_file("recover-provider-active", "active");
    let output = successful(&helper, "recover comp1 -x");
    assert_eq!(output.stdout.matches("recovery provider mutation").count(), 1);
    assert_eq!(
        bitmap(&helper)["comp1"]["config"]["teambit.pkg/pkg"]["packageJson"]["recoveryProvider"],
        true,
    );
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("comp1/provider.js")).unwrap(),
        "module.exports=42;\n",
    );
}
