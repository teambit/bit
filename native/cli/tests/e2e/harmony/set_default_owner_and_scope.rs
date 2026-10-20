//! `e2e/harmony/set-default-owner-and-scope.e2e.ts`.

use crate::helper::{Helper, config};
use serde_json::json;
use std::fs;

/// set default owner and scope › author components
#[test]
fn set_default_owner_and_scope_author_export_import() {
    let helper = Helper::new();
    let owner = "owner";
    let scope_without_owner = helper.scopes.remote.clone();
    let default_scope = format!("{owner}.{scope_without_owner}");

    helper.re_init_workspace_with(false);
    helper.re_init_remote_scope();
    config::update_scope_json(&helper.scopes.remote_path.join("scope.json"), |scope| {
        scope.insert("name".into(), json!(default_scope));
    });
    let url = format!("file://{}", helper.scopes.remote_path.display());
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        let remotes = scope
            .entry("remotes")
            .or_insert_with(|| json!({}));
        remotes[&default_scope] = serde_json::Value::String(url.clone());
    });
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        json!(default_scope),
    );

    helper.output_file("utils/is-type.js", "module.exports = () => true;");
    helper.run("add utils -i utils/is-type");
    let link_raw = helper.run("link -j");
    let link_json: serde_json::Value = serde_json::from_str(&link_raw).unwrap();
    let pkg_name = format!("@{owner}/{scope_without_owner}.utils.is-type");
    assert!(link_raw.contains("is-type.js"), "{link_json}");
    assert!(
        helper.scopes.local_path
            .join("node_modules")
            .join(&pkg_name)
            .is_dir(),
    );

    helper.run("tag --message v1");
    let export_out = helper.run("export");
    assert!(export_out.contains("exported components (1)") || export_out.contains(&default_scope));

    let comp_model: serde_json::Value =
        serde_json::from_str(&helper.run("cat-component utils/is-type --json")).unwrap();
    let ver_model: serde_json::Value =
        serde_json::from_str(&helper.run("cat-component utils/is-type@latest --json")).unwrap();
    assert_eq!(comp_model["scope"].as_str(), Some(default_scope.as_str()));
    assert_eq!(comp_model["bindingPrefix"].as_str(), Some("@owner"));
    assert_eq!(ver_model["bindingPrefix"].as_str(), Some("@owner"));

    helper.re_init_workspace_with(false);
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        json!(default_scope),
    );
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        let remotes = scope
            .entry("remotes")
            .or_insert_with(|| json!({}));
        remotes[&default_scope] = serde_json::Value::String(url);
    });
    helper.run(&format!("import {default_scope}/utils/is-type"));
    assert!(
        helper.scopes.local_path
            .join("node_modules")
            .join(&pkg_name)
            .is_dir(),
    );
    let pkg_json: serde_json::Value = serde_json::from_slice(
        &fs::read(
            helper.scopes.local_path
                .join("node_modules")
                .join(&pkg_name)
                .join("package.json"),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(pkg_json["name"].as_str(), Some(pkg_name.as_str()));
    assert_eq!(pkg_json["componentId"]["scope"].as_str(), Some(default_scope.as_str()));
    assert_eq!(pkg_json["componentId"]["name"].as_str(), Some("utils/is-type"));
    assert_eq!(pkg_json["componentId"]["version"].as_str(), Some("0.0.1"));
}
