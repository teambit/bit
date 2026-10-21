//! `e2e/functionalities/workspace-config.e2e.ts`.

use crate::helper::{Helper, parse, strip_ansi};

const OVERRIDE_EXTENSION: &str = "teambit.dependencies/dependency-resolver";

fn set_policy_to_variant(helper: &Helper, variant: &str, policy: serde_json::Value) {
    let mut config = serde_json::Map::new();
    config.insert("policy".to_owned(), policy);
    helper.add_extension_to_variant(variant, OVERRIDE_EXTENSION, serde_json::Value::Object(config));
}

#[test]
fn ignoring_components_and_packages_dependencies() {
    // 1. ignoring a dependency component when requiring with module path: should not add the removed dependency to the component
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;
    helper.write_file("foo1/foo1.js", "");
    helper.write_file("foo2/foo2.js", "");
    helper.write_file("bar/bar.js", "require('../foo1/foo1'); require('../foo2/foo2'); ");
    helper.add_component("foo1", "-i utils/foo/foo1");
    helper.add_component("foo2", "-i utils/foo/foo2");
    helper.add_component("bar", "");
    helper.link("--rewire");
    set_policy_to_variant(
        &helper,
        "bar",
        serde_json::json!({
            "dependencies": {
                format!("@{remote}/utils.foo.foo1"): "-"
            }
        }),
    );
    let show_bar = parse(&helper.show_component_parsed("bar"));
    assert_eq!(
        show_bar["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_ne!(show_bar["dependencies"][0]["id"].as_str().unwrap(), "foo1");

    // 2. ignoring a missing package: bit status should not show the component as missing packages
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.write_file("bar/bar.js", "require('non-exist-package')");
    helper2.add_component("bar", "");
    helper2.compile();
    set_policy_to_variant(
        &helper2,
        "bar",
        serde_json::json!({
            "dependencies": {
                "non-exist-package": "-"
            }
        }),
    );
    let status = helper2.status();
    assert!(!status.contains("MissingPackagesDependenciesOnFs"));

    // 3. ignoring an existing package
    let helper3 = Helper::new();
    helper3.set_workspace_with_remote_scope();
    helper3.npm_add_fake_package("existing-package", "4.4.2", false);
    helper3.npm_add_fake_package("another-existing-package", "4.4.2", false);
    helper3.write_file(
        "bar/bar.js",
        "require('existing-package'); require('another-existing-package');",
    );
    helper3.add_component("bar", "");
    set_policy_to_variant(
        &helper3,
        "bar",
        serde_json::json!({
            "dependencies": {
                "existing-package": "-"
            }
        }),
    );
    let show_bar = parse(&helper3.show_component_parsed("bar"));
    assert_eq!(
        show_bar["packageDependencies"],
        serde_json::json!({ "another-existing-package": "4.4.2" }),
    );
    assert!(
        show_bar["manuallyRemovedDependencies"]["dependencies"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("existing-package")),
    );

    // 4. ignoring an existing devDependency package
    let helper4 = Helper::new();
    helper4.set_workspace_with_remote_scope();
    helper4.npm_add_fake_package("existing-package", "4.4.2", false);
    helper4.npm_add_fake_package("another-existing-package", "4.4.2", false);
    helper4.write_file("bar/bar.js", "");
    helper4.write_file(
        "bar/bar.spec.js",
        "require('existing-package'); require('another-existing-package');",
    );
    helper4.add_component("bar", "");
    set_policy_to_variant(
        &helper4,
        "bar",
        serde_json::json!({
            "devDependencies": {
                "existing-package": "-"
            }
        }),
    );
    let show_bar = parse(&helper4.show_component_parsed("bar"));
    assert_eq!(show_bar["packageDependencies"], serde_json::json!({}));
    assert!(show_bar["devPackageDependencies"].get("another-existing-package").is_some());
    assert!(show_bar["devPackageDependencies"].get("existing-package").is_none());
    assert!(
        show_bar["manuallyRemovedDependencies"]["devDependencies"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("existing-package")),
    );
    assert!(show_bar["manuallyRemovedDependencies"].get("dependencies").is_none());
}

#[test]
fn ignoring_dependencies_components_entire_flow() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;
    helper.write_file("foo1/foo1.js", "");
    helper.write_file("foo2/foo2.js", "");
    helper.write_file("bar/bar.js", "require('../foo1/foo1'); require('../foo2/foo2'); ");
    helper.add_component("foo1", "-i utils/foo/foo1");
    helper.add_component("foo2", "-i utils/foo/foo2");
    helper.add_component("bar", "");
    helper.link("--rewire");
    helper.tag_all_without_build("");
    helper.export("");
    set_policy_to_variant(
        &helper,
        "bar",
        serde_json::json!({
            "dependencies": {
                format!("@{remote}/utils.foo.foo2"): "-"
            }
        }),
    );
    helper.tag_Without_Build_id("bar", "");
    let cat_bar = parse(&helper.cat_component("bar@latest"));

    // 1. should remove the dependency from the model
    assert_eq!(
        cat_bar["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    // 2. should save the overrides data into the model
    assert_eq!(
        cat_bar["overrides"]["dependencies"][format!("@{remote}/utils.foo.foo2")].as_str().unwrap(),
        "-",
    );

    // 3. should not show the component as modified
    let status = helper.status();
    assert!(!status.contains("modified components"));

    // importing the component
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("*", "-x");
    helper.link("");
    helper.compile();

    // 4. bit status should not show the component as modified
    helper.expect_status_to_be_clean();

    // 5. bit diff should not show any diff
    let diff = helper.diff("bar");
    assert!(diff.contains("no diff"));

    // changing the imported component to not ignore the dependency
    helper.run_cmd("eject-conf bar");
    let comp_json_path =
        helper.scopes.local_path.join(&helper.scopes.remote).join("bar/component.json");
    let mut comp_json = crate::helper::config::read_jsonc(&comp_json_path);
    comp_json["extensions"]
        .as_object_mut()
        .unwrap()
        .remove(OVERRIDE_EXTENSION);
    crate::helper::config::write_json(&comp_json_path, &comp_json, b"  ");

    // 6. bit status should show the component as modified
    let status = helper.status();
    assert!(status.contains("modified components"));

    // 7. bit diff should show the overrides differences
    let diff = helper.diff("bar --verbose");
    assert!(diff.contains("--- Overrides Dependencies (0.0.2 original)"), "{diff}");
    assert!(diff.contains("+++ Overrides Dependencies (0.0.2 modified)"), "{diff}");
    assert!(diff.contains(&format!("- [ @{remote}/utils.foo.foo2@-")), "{diff}");
}

#[test]
fn manually_adding_dependencies() {
    // 1. moving a package from dependencies to peerDependencies
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("import chai from 'chai';");
    helper.npm_add_fake_package("chai", "2.2.0", false);
    helper.write_file(
        "package.json",
        &serde_json::to_string_pretty(&serde_json::json!({
            "dependencies": { "chai": "2.2.0" }
        }))
        .unwrap(),
    );
    helper.add_component_bar_foo();
    set_policy_to_variant(
        &helper,
        "bar",
        serde_json::json!({
            "dependencies": { "chai": "-" },
            "peerDependencies": { "chai": "+" }
        }),
    );
    let show_bar = parse(&helper.show_component_parsed("bar/foo"));
    assert_eq!(show_bar["packageDependencies"], serde_json::json!({}));
    assert_eq!(show_bar["peerPackageDependencies"], serde_json::json!({ "chai": "2.2.0" }));
    assert!(
        show_bar["manuallyRemovedDependencies"]["dependencies"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("chai")),
    );
    assert_eq!(
        show_bar["manuallyAddedDependencies"]["peerDependencies"],
        serde_json::json!(["chai@2.2.0"]),
    );

    // 2. adding a package with version that does not exist in package.json
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.create_component_bar_foo("import chai from 'chai';");
    helper2.add_component_bar_foo();
    set_policy_to_variant(
        &helper2,
        "bar",
        serde_json::json!({
            "peerDependencies": { "chai": "2.2.0" }
        }),
    );
    let show_bar = parse(&helper2.show_component_parsed("bar/foo"));
    assert_eq!(show_bar["peerPackageDependencies"], serde_json::json!({ "chai": "2.2.0" }));
    assert_eq!(
        show_bar["manuallyAddedDependencies"]["peerDependencies"],
        serde_json::json!(["chai@2.2.0"]),
    );

    // 3. adding a package without version that does not exist in package.json
    let helper3 = Helper::new();
    helper3.set_workspace_with_remote_scope();
    helper3.create_component_bar_foo("import chai from 'chai';");
    helper3.add_component_bar_foo();
    set_policy_to_variant(
        &helper3,
        "bar",
        serde_json::json!({
            "peerDependencies": { "chai": "+" }
        }),
    );
    let show_output = helper3.run_cmd("show bar/foo");
    assert!(!show_output.contains(r#"chai""#));
    let status_out = strip_ansi(&helper3.status()).replace('\n', "");
    helper3.expect_status_to_have_issue("MissingPackagesDependenciesOnFs");
    assert!(status_out.contains("foo.js -> chai"), "{status_out}");
}
