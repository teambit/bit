//! Cases from:
//! - `e2e/harmony/dependencies.e2e.ts`
//! - `e2e/harmony/diff-component-peer.e2e.ts`
//! - `e2e/harmony/deps-write.e2e.ts`
//! - `e2e/harmony/pkg.e2e.ts`
//! - `e2e/harmony/install-missing-dependencies.e2e.ts`
//! - `e2e/harmony/installing-component-dependency.e2e.ts`
//! - `e2e/harmony/imported-component-deps.e2e.ts`

use crate::{
    helper::{Helper, config, parse},
    known_failure::KnownResult,
};
use serde_json::json;

#[test]
fn dependencies_env_component_and_missing_dist_and_auto_detect_peers() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_id = helper.set_custom_env("env-add-dependencies");
    let full_env_id = format!("{}/{env_id}", helper.scopes.remote);
    helper.output_file(
        "bar/foo.js",
        "const isPositive = require('is-positive');\nconst isString = require('is-string');\n",
    );
    helper.add_component_bar_foo();
    helper.add_extension_to_variant("bar", &full_env_id, json!({}));
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.add_key_val_to_dependency_resolver_policy("is-string", "1.0.0");
    helper.npm_add_fake_package("is-positive", "1.0.0", false);
    helper.npm_add_fake_package("is-string", "1.0.0", false);
    helper.npm_add_fake_package("lodash.get", "4.4.2", false);
    helper.tag_all_without_build("");

    let ver = parse(&helper.cat_component(&format!("{}/bar/foo@0.0.1", helper.scopes.remote)));
    let pkg_deps = &ver["packageDependencies"];
    assert_eq!(pkg_deps["is-positive"].as_str(), Some("1.0.0"), "{pkg_deps}");
    assert_eq!(pkg_deps["is-string"].as_str(), Some("1.0.0"), "{pkg_deps}");
    let dev_deps = &ver["devPackageDependencies"];
    assert_eq!(dev_deps["lodash.get"].as_str(), Some("4.4.2"), "{dev_deps}");

    // importing a component when env dependency is in the model
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("bar/foo", "-x");
    let show = parse(&helper.show_component_parsed("bar/foo"));
    assert_eq!(show["devPackageDependencies"]["lodash.get"].as_str(), Some("4.4.2"), "{show}");

    // dynamic import -> should recognize the dependency
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "import('./bar');\n");
    helper.output_file("comp1/bar.js", "import 'is-positive';\n");
    helper.run("add comp1");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.npm_add_fake_package("is-positive", "1.0.0", false);
    let show_deps = helper.get_comp_deps_ids_from_data("comp1");
    assert!(
        show_deps
            .iter()
            .any(|dep| dep == "is-positive"),
        "{show_deps:?}",
    );

    // component with dependencies that were not compiled yet (no dist in node_modules) ->
    // bit status should not show MissingPackagesDependenciesOnFs
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.delete_path(&format!("node_modules/@{}/comp2/dist", helper.scopes.remote));
    helper.expect_status_to_not_have_issue("MissingPackagesDependenciesOnFs");

    // peer dependencies from env -> when the component is using the peer dependency
    // should save the peer dependency in the component's peerPackageDependencies
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.output_file("comp1/index.js", "const react = require('react');\n");
    helper.add_key_val_to_dependency_resolver_policy("react", "17.0.2");
    helper.npm_add_fake_package("react", "17.0.2", false);
    helper.tag_all_without_build("");
    let ver = parse(&helper.cat_component("comp1@latest"));
    assert!(
        ver["peerPackageDependencies"].get("react").is_some()
            || ver["packageDependencies"].get("react").is_some(),
        "{ver}",
    );
    Ok(())
}

#[test]
fn diff_component_peer_and_deps_write_and_pkg() -> KnownResult<()> {
    let helper = Helper::new();

    // diff-component-peer.e2e.ts: component is set as peer dependency ->
    // tagging both components should not show the peer component as modified in bit status and bit diff
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("set-peer comp2 0");
    helper.link("");
    helper.tag_all_without_build("");
    let st = helper.status_json_or_known()?;
    assert_eq!(
        st["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    let diff = helper.diff("comp1");
    assert!(!diff.contains("peerDependencies"), "{diff}");

    // deps-write.e2e.ts: bit deps write
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.output_file("comp1/index.js", "const isPositive = require('is-positive');\n");
    helper.npm_add_fake_package("is-positive", "1.0.0", false);
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x");
    helper.run("deps write");
    let ws = helper.read_workspace_jsonc();
    assert!(
        ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]
            .get("is-positive")
            .is_some(),
        "{ws}",
    );

    // pkg.e2e.ts: pkg aspect -> package.json properties and custom packageName
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.add_extension_to_variant(
        "comp1",
        "teambit.pkg/pkg",
        json!({
            "packageJson": {
                "name": "my-custom-pkg-name",
                "private": false,
                "customProp": "val"
            }
        }),
    );
    helper.link("");
    let pkg_json = config::read_jsonc(&helper.scopes.local_path.join(
        "node_modules/my-custom-pkg-name/package.json",
    ));
    assert_eq!(pkg_json["name"].as_str(), Some("my-custom-pkg-name"));
    assert_eq!(pkg_json["customProp"].as_str(), Some("val"));
    assert_eq!(pkg_json["private"].as_bool(), Some(false));
    Ok(())
}

#[test]
fn install_missing_dependencies_and_installing_component_dep_and_imported_component_deps()
-> KnownResult<()> {
    let helper = Helper::new();

    // install-missing-dependencies.e2e.ts: bit install --add-missing-deps
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.output_file("comp1/index.js", "const isPositive = require('is-positive');\n");
    helper.run("install --add-missing-deps");
    helper.expect_status_to_not_have_issues();
    let ws = helper.read_workspace_jsonc();
    assert!(
        ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]
            .get("is-positive")
            .is_some(),
        "{ws}",
    );

    // installing-component-dependency.e2e.ts & imported-component-deps.e2e.ts
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.output_file(
        "comp2/index.js",
        "const isPositive = require('is-positive');\nmodule.exports = () => isPositive(1);\n",
    );
    helper.run("install is-positive@1.0.0");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x");
    let show = helper.get_comp_deps_ids_from_data("comp1");
    assert!(
        show.iter()
            .any(|d| d.starts_with(&format!("{}/comp2@", helper.scopes.remote))),
        "{show:?}",
    );
    Ok(())
}
