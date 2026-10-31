use super::load_order;
use crate::manifests::tests::component;
use serde_json::json;

const NODE: &str = "teambit.harmony/node";

#[test]
fn envs_then_configured_extensions_then_the_rest() {
    let mut app = component("org.ui", "app", Some("1.0.0"), NODE);
    app.config.insert("org.ui/scanner@1.0.0".into(), json!({}));
    let mut lib = component("org.ui", "lib", Some("1.0.0"), "org.envs/my-env@2.0.0");
    lib.config.insert("org.envs/my-env@2.0.0".into(), json!({}));
    let env = component("org.envs", "my-env", Some("2.0.0"), "teambit.envs/env");
    let scanner = component("org.ui", "scanner", Some("1.0.0"), NODE);
    // A version the configuration does not name is not the configured extension.
    let other = component("org.ui", "other", Some("3.0.0"), NODE);
    let components = [app, lib, env, scanner, other];
    let order: Vec<String> = load_order(&components)
        .into_iter()
        .map(|component| component.id.to_string_without_version())
        .collect();
    assert_eq!(
        order,
        ["org.envs/my-env", "org.ui/scanner", "org.ui/app", "org.ui/lib", "org.ui/other"],
    );
}
