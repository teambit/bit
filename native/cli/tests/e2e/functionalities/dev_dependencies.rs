//! `e2e/functionalities/dev-dependencies.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn environment_with_compiler_and_tester() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;
    helper.populate_components(3, true, "");
    helper.write_file(
        "comp1/comp1.spec.js",
        &format!(
            "const expect = require('chai').expect;\nconst foo = require('@{remote}/comp2');\ndescribe('comp1', () => {{ it('should display \"comp2 and comp3\"', () => {{ expect(foo()).to.equal('comp2 and comp3'); }}); }});",
        ),
    );
    helper.npm_add_fake_package("chai", "4.1.2", false);
    helper.add_key_val_to_dependency_resolver_policy("chai", "4.1.2");
    helper.link("");
    let cloned_scope = helper.clone_workspace();

    // with dev-dependencies same as dependencies
    helper.tag_all_without_build("");
    let bar_foo = parse(&helper.cat_component("comp1@0.0.1"));

    // 1. should not save the dev-dependencies because they are the same as dependencies
    assert_eq!(
        bar_foo["devDependencies"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 2. should save "chai" in the dev-packages because it is only required in the tests files
    assert_eq!(bar_foo["devPackageDependencies"]["chai"].as_str(), Some("4.1.2"));

    // 3. should not save "chai" in the packages because it is not required in non-test files
    assert_eq!(bar_foo["packageDependencies"], serde_json::json!({}));

    // 4. should leave the dependencies intact
    assert_eq!(
        bar_foo["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(bar_foo["dependencies"][0]["id"]["name"].as_str().unwrap(), "comp2");
    assert_eq!(bar_foo["dependencies"][0]["id"]["version"].as_str().unwrap(), "0.0.1");

    // 5. should leave the flattened-dependencies intact
    let flat = bar_foo["flattenedDependencies"].as_array().unwrap();
    assert!(flat.contains(
        &serde_json::json!({ "scope": remote, "name": "comp2", "version": "0.0.1" })
    ));
    assert!(flat.contains(
        &serde_json::json!({ "scope": remote, "name": "comp3", "version": "0.0.1" })
    ));

    // without dependencies and with dev-dependencies
    helper.get_cloned_workspace(&cloned_scope);
    helper.write_file("comp1/index.js", r#"console.log("foo")"#);
    helper.tag_all_without_build("");
    let bar_foo = parse(&helper.cat_component("comp1@0.0.1"));

    // 6. should save the dev-dependencies
    assert_eq!(
        bar_foo["devDependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        bar_foo["devDependencies"][0]["id"],
        serde_json::json!({ "scope": remote, "name": "comp2", "version": "0.0.1" }),
    );

    // 7. should save the flattened dev-dependencies into flattened-dependencies
    let flat = bar_foo["flattenedDependencies"].as_array().unwrap();
    assert!(flat.contains(
        &serde_json::json!({ "scope": remote, "name": "comp3", "version": "0.0.1" })
    ));
    assert!(flat.contains(
        &serde_json::json!({ "scope": remote, "name": "comp2", "version": "0.0.1" })
    ));

    // 8. should not save anything into dependencies
    assert_eq!(
        bar_foo["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 9. bit status should not show any component as modified
    let status = helper.status_json();
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
}

#[test]
fn dev_dependency_nested_chains_and_deps_remove() {
    // 1. dev-dependency of a nested component that originated from a prod dep
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;
    helper.populate_components(4, true, "");
    helper.move_sync("comp2/index.js", "comp2/foo.spec.js");
    helper.write_file("comp2/index.js", "module.exports = () => 'comp2';");
    helper.tag_all_without_build("");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    let import_output = helper.import_component("comp1", "-x");
    assert!(import_output.contains("successfully imported one component"));
    helper.expect_status_to_be_clean_except(&["modifiedComponents", "componentsWithIssues"]);

    let bar = parse(&helper.cat_component(&format!("{remote}/comp1@latest")));
    assert_eq!(
        bar["flattenedDependencies"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    // 2. dev-dependency of a nested component that originated from a dev dep
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.populate_components(4, true, "");
    helper2.move_sync("comp1/index.js", "comp1/foo.spec.js");
    helper2.write_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper2.move_sync("comp2/index.js", "comp2/foo.spec.js");
    helper2.write_file("comp2/index.js", "module.exports = () => 'comp2';");
    helper2.tag_all_without_build("");
    let bar = parse(&helper2.cat_component("comp1@latest"));
    let names: Vec<&str> = bar["flattenedDependencies"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|dep| dep["name"].as_str())
        .collect();
    assert!(names.contains(&"comp3"));
    assert!(names.contains(&"comp2"));

    // 3. dev-dependency that requires prod-dependency
    let helper3 = Helper::new();
    helper3.set_workspace_with_remote_scope();
    helper3.populate_components(3, true, "");
    helper3.move_sync("comp1/index.js", "comp1/foo.spec.js");
    helper3.write_file("comp1/index.js", "");
    helper3.tag_all_without_build("");
    let bar_foo = parse(&helper3.cat_component("comp1@latest"));
    assert_eq!(
        bar_foo["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        bar_foo["devDependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(bar_foo["devDependencies"][0]["id"]["name"].as_str().unwrap(), "comp2");
    assert!(
        bar_foo["flattenedDependencies"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|entry| entry["name"].as_str())
            .any(|name| name == "comp3"),
    );

    // 4. component with devDependency coming from an env and is used as prod: should be able to remove it from DevDependency only by "bit deps remove --dev"
    let helper4 = Helper::new();
    helper4.set_workspace_with_remote_scope();
    helper4.populate_components(1, false, "");
    helper4.write_file("comp1/index.js", "const isPositive = require('is-positive');");
    helper4.run_cmd("deps remove comp1 is-positive --dev");
    let bitmap = helper4.read_bit_map();
    assert_eq!(
        bitmap["comp1"]["config"]["teambit.dependencies/dependency-resolver"]["policy"]["devDependencies"]["is-positive"]
            .as_str()
            .unwrap(),
        "-",
    );
}
