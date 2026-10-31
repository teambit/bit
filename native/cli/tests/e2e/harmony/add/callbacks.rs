//! Published callbacks observe the same newly tracked classes before generated packages are linked.
use crate::{
    commands::add::support::{compare, node, workspace},
    helper::{Helper, config},
};
use serde_json::{Value, json};
use std::fs;

fn configured() -> (Helper, String) {
    let helper = workspace();
    let id = format!("{}/env/add", helper.scopes.remote);
    let source = include_str!("aspect.cjs");
    helper.output_file("add-env/index.js", source);
    helper.run("add add-env -i env/add");
    config::set_component_env(&helper.scopes.local_path, "env/add", "teambit.envs/env");
    helper.run("link");
    helper.output_file("add-env/dist/index.js", source);
    let result = node(&helper.scopes.local_path, "tag env/add -m environment --ignore-issues *");
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    config::set_workspace_key(&helper.scopes.local_path, &id, json!({}));
    helper.output_file("add-callback-active", "active");
    (helper, id)
}

#[test]
fn explicit_identity_onload_and_package_callbacks_observe_canonical_class_versions() {
    let (helper, env) = configured();
    helper.output_file("fresh/index.js", "module.exports='fresh';\n");
    helper.output_file("fresh/extra.js", "module.exports='extra';\n");
    let result = compare(&helper, &format!("add fresh -i fresh/component -e {env}"));
    assert!(result.status.success(), "{}", result.stderr);
    let package = helper.scopes.local_path.join(format!(
        "node_modules/@{}/fresh.component/package.json",
        helper.scopes.remote,
    ));
    let manifest: Value = serde_json::from_slice(&fs::read(package).unwrap()).unwrap();
    assert_eq!(manifest["addFixture"]["name"], "fresh/component");
    assert_eq!(manifest["addFixture"]["mainFile"], "index.js");
    assert_eq!(manifest["addFixture"]["idVersion"], "latest");
    assert_eq!(manifest["addFixture"]["legacyVersion"], "latest");
    let events = fs::read_to_string(helper.scopes.local_path.join("add-callback-events")).unwrap();
    assert!(events.contains(r#""phase":"load""#));
    assert!(events.contains(r#""phase":"package""#));
}

#[test]
fn package_callback_failure_precedes_link_and_bitmap_publication() {
    let (helper, env) = configured();
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({"*":{env.clone():{},"teambit.envs/envs":{"env":env}}}),
    );
    helper.output_file("second/index.js", "module.exports='second';\n");
    helper.output_file("add-package-fails", "fail");
    let before = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let result = compare(&helper, "add second");
    assert!(!result.status.success());
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), before);
    let package = helper.scopes.local_path.join(format!(
        "node_modules/@{}/second/package.json",
        helper.scopes.remote,
    ));
    assert!(!package.exists());
}

#[test]
fn filesystem_link_failure_preserves_blocked_package_and_old_bitmap() {
    let helper = workspace();
    helper.output_file("second/index.js", "module.exports=2;\n");
    let blocked = helper.scopes.local_path.join(format!(
        "node_modules/@{}/second/package.json",
        helper.scopes.remote,
    ));
    fs::create_dir_all(blocked).unwrap();
    let before = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let result = compare(&helper, "add second");
    assert!(!result.status.success());
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), before);
    assert!(
        helper.scopes.local_path
            .join(format!("node_modules/@{}/second/package.json", helper.scopes.remote))
            .is_dir(),
    );
}
