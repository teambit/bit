//! `e2e/harmony/extensions-config.e2e.ts`.

use crate::helper::{Helper, parse};
use serde_json::json;

/// - `harmony extension config › persist extension config (provided by the user)to models › core extensions › should persist core extension config during tag`
/// - `harmony extension config › persist extension config (provided by the user)to models › core extensions › should not have version for core extension in the models`
/// - `harmony extension config › persist extension config (provided by the user)to models › core extensions › should not insert core extensions into the component dev deps`
#[test]
fn persist_core_extension_config_to_models() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.add_extension_to_variant("*", "teambit.scope/scope", json!({ "key": "val" }));
    helper.native("tag --skip-tests");

    let comp_ver = parse(&helper.native("cat-component bar/foo@0.0.1 --json"));
    let exts = comp_ver["extensions"].as_array().unwrap();
    let scope_ext = exts
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.scope/scope"))
        .expect("teambit.scope/scope extension in model");
    assert_eq!(scope_ext["config"], json!({ "key": "val" }));
    assert_eq!(exts[0]["name"].as_str(), Some("teambit.scope/scope"));
    assert_eq!(
        comp_ver["devDependencies"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
}

/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › should not allow tagging the component without tagging the extensions`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › removing the extension with "-" › should have the extension defined on the component`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › removing the extension with "-" › should not have the extension defined on the component`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should have version for extension in the component models when tagging with the component`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should persist extension config during tag`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should not insert extensions into the component dev deps`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should insert extensions flattened dependencies into the component flattened dependencies`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension and component together › should auto tag the component when tagging the extension again`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension then component › should have version for extension in the component models when tagging the extension before component`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › tagging extension then component › should not insert the pre-tagged extension into the component dev deps`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › exporting component with extension › should block exporting component without exporting the extension`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › exporting component with extension › exporting extension and component together › should update extension scope in the component when exporting together`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › extension is new component on the workspace › exporting component with extension › exporting extension then exporting component › should update extension scope in the component when exporting component after exporting the extension`
/// - `harmony extension config › persist extension config (provided by the user)to models › 3rd party extensions › imported component › should auto-import the extensions as well`
#[test]
fn persist_third_party_extension_config_tag_export_and_import() {
    let helper = Helper::new();
    let ext_folder = "dummy-extension-without-logs";
    helper.re_init_workspace();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    let remote = helper.scopes.remote.clone();
    helper.add_default_scope(&remote);
    helper.disable_preview();
    helper.copy_fixture_extensions(ext_folder);
    helper.add_component(ext_folder, "");
    let ext_id = format!("{remote}/{ext_folder}");
    helper.add_extension_to_variant("*", &ext_id, json!({ "key": "val" }));
    helper.add_extension_to_variant(ext_folder, "teambit.harmony/aspect", json!({}));
    helper.link("");
    helper.compile();
    let local_before_tag = helper.clone_workspace();

    // 1. Tagging bar/foo without tagging extension fails
    let tag_err = helper.native_run("tag bar/foo --skip-tests");
    assert_ne!(tag_err.status.code(), Some(0));
    let combined = format!("{}\n{}", tag_err.stdout, tag_err.stderr);
    assert!(
        combined.contains("has a dependency") || combined.contains("resolve graph version"),
        "{combined}",
    );

    // 2. Removing the extension with "-"
    let show_before = parse(&helper.show_component_parsed("bar/foo"));
    assert!(
        show_before["extensions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|ext| ext["extensionId"]
                .as_str()
                .is_some_and(|text| text.contains(ext_folder))),
    );
    helper.add_extension_to_variant("bar", &ext_id, json!("-"));
    let show_after = parse(&helper.show_component_parsed("bar/foo"));
    assert!(
        !show_after["extensions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|ext| ext["extensionId"]
                .as_str()
                .is_some_and(|text| text.contains(ext_folder))),
    );

    // 3. Tagging extension and component together
    helper.get_cloned_workspace(&local_before_tag);
    helper.disable_preview();
    helper.native("tag --skip-tests");
    let comp_model = parse(&helper.native("cat-component bar/foo@0.0.1 --json"));
    assert_eq!(comp_model["extensions"][0]["extensionId"]["version"], json!("0.0.1"));
    assert_eq!(comp_model["extensions"][0]["config"], json!({ "key": "val" }));
    assert_eq!(
        comp_model["devDependencies"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        comp_model["flattenedDependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(comp_model["flattenedDependencies"][0]["name"].as_str(), Some(ext_folder));

    let retag_out = helper.native(&format!("tag {ext_folder} --unmodified --skip-tests"));
    assert!(retag_out.contains("2 component(s) tagged"), "{retag_out}");
    assert!(retag_out.contains("auto-tagged dependents"), "{retag_out}");

    // 4. Tagging extension then component
    helper.get_cloned_workspace(&local_before_tag);
    helper.native(&format!("tag {ext_folder} --skip-tests"));
    helper.native("tag bar/foo --skip-tests");
    let comp_model2 = parse(&helper.native("cat-component bar/foo@0.0.1 --json"));
    assert_eq!(comp_model2["extensions"][0]["extensionId"]["version"], json!("0.0.1"));
    assert_eq!(
        comp_model2["devDependencies"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 5. Exporting component with extension
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    let local_before_export = helper.clone_workspace();
    let remote_before_export = helper.clone_remote_scope();

    let exp_err = helper.native_run("export bar/foo");
    assert_ne!(exp_err.status.code(), Some(0));

    helper.native("export");
    let comp_model_exp = parse(&helper.native("cat-component bar/foo@0.0.1 --json"));
    assert_eq!(comp_model_exp["extensions"][0]["extensionId"]["scope"], json!(remote));

    // Export extension then component
    helper.get_cloned_workspace(&local_before_export);
    helper.get_cloned_remote_scope(&remote_before_export);
    helper.native(&format!("export {ext_folder}"));
    helper.native("export bar/foo");
    let comp_model_exp2 = parse(&helper.native("cat-component bar/foo@0.0.1 --json"));
    assert_eq!(comp_model_exp2["extensions"][0]["extensionId"]["scope"], json!(remote));

    // 6. Imported component auto-imports the extension
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {remote}/bar/foo"));
    let scope_list = parse(&helper.native("list --local-scope --json"));
    let ids: Vec<&str> = scope_list
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["id"].as_str())
        .collect();
    assert!(ids.contains(&ext_id.as_str()), "expected {ext_id} in {ids:?}");
}

/// - `harmony extension config › changing config after the component had been cached › should show the updated dependency data and not the old data from the cache`
#[test]
fn changing_config_after_component_cached() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.add_extension_to_variant(
        "bar",
        "teambit.dependencies/dependency-resolver",
        json!({ "policy": { "dependencies": { "lodash.get": "4.0.0" } } }),
    );
    helper.native("status");
    helper.add_extension_to_variant(
        "bar",
        "teambit.dependencies/dependency-resolver",
        json!({ "policy": { "dependencies": { "lodash.get": "5.0.0" } } }),
    );
    let bar = parse(&helper.show_component_parsed("bar/foo"));
    assert_eq!(bar["packageDependencies"]["lodash.get"], json!("5.0.0"));
}
