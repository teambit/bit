//! Provider writes occur before authoritative operation planning, once per command.
use super::support::{self, bitmap, setup, successful};
use crate::helper::{Helper, config};
use serde_json::json;
use std::fs;
fn configured(tagged: bool) -> Helper {
    let helper = support::workspace(1, false);
    let source = include_str!("provider.cjs");
    helper.output_file("identity-env/index.js", source);
    setup(&helper, "add identity-env -i env/identity");
    config::set_component_env(&helper.scopes.local_path, "env/identity", "teambit.envs/env");
    setup(&helper, "link");
    helper.output_file("identity-env/dist/index.js", source);
    setup(&helper, "tag env/identity --ignore-issues * --message provider");
    if tagged {
        setup(&helper, "tag comp1 --ignore-issues * --message component");
    }
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/identity", helper.scopes.remote),
        json!({}),
    );
    helper.output_file("identity-provider-active", "active");
    helper
}
#[test]
fn move_rereads_provider_bitmap_and_sources_before_publication() {
    let helper = configured(false);
    let result = successful(&helper, "move comp1 moved");
    assert_once(&result.stdout);
    assert_eq!(
        bitmap(&helper)["comp1"]["config"]["teambit.component/deprecation"]["deprecate"],
        false,
    );
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("moved/provider-created.js")).unwrap(),
        "module.exports=42;\n",
    );
}
#[test]
fn deprecation_rereads_provider_configuration_without_overwriting_it() {
    let helper = configured(true);
    let result = successful(&helper, "deprecate comp1");
    assert_once(&result.stdout);
    let configuration = &bitmap(&helper)["comp1"]["config"]["teambit.component/deprecation"];
    // Deprecation replaces its own aspect config, while unrelated provider config survives.
    assert_eq!(configuration["deprecate"], true);
    assert_eq!(
        bitmap(&helper)["comp1"]["config"]["teambit.pkg/pkg"]["packageJson"]["identityProvider"],
        "retained",
    );
    assert!(helper.scopes.local_path.join("comp1/provider-created.js").is_file());
}
#[test]
fn rename_rereads_provider_configuration_and_moves_newly_created_sources() {
    let helper = configured(false);
    let result = successful(&helper, "rename comp1 comp2");
    assert_once(&result.stdout);
    let map = bitmap(&helper);
    assert_eq!(map["comp2"]["config"]["teambit.component/deprecation"]["deprecate"], false);
    let root = map["comp2"]["rootDir"].as_str().unwrap();
    assert!(
        helper.scopes.local_path
            .join(root)
            .join("provider-created.js")
            .is_file(),
    );
}
fn assert_once(output: &str) {
    assert_eq!(output.matches("identity provider mutation").count(), 1, "{output}");
}

#[test]
fn invalid_rename_runs_provider_once_before_its_owned_validation_error() {
    let helper = configured(false);
    let result = support::compare(&helper, "rename comp1 my.comp");
    assert!(!result.status.success());
    assert_once(&result.stdout);
    assert!(helper.scopes.local_path.join("comp1/provider-created.js").is_file());
    assert_eq!(
        bitmap(&helper)["comp1"]["config"]["teambit.pkg/pkg"]["packageJson"]["identityProvider"],
        "retained",
    );
    assert!(
        !helper.scopes.local_path
            .join(&helper.scopes.remote)
            .join("my.comp")
            .exists(),
    );
}
