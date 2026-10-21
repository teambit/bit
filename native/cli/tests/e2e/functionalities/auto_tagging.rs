//! `e2e/functionalities/auto-tagging.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn with_dependencies_of_dependencies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    helper.write_file("comp3/index.js", "module.exports = () => 'comp3 v2';");

    let status_output = helper.status();
    assert!(status_output.contains("components pending auto-tag"));

    let before_auto_tag = helper.clone_workspace();
    let tag_output = helper.tag_Without_Build_id("comp3", "");

    // 1. should auto tag the dependencies and the nested dependencies
    assert!(tag_output.contains("auto-tagged dependents"));
    let details = helper.run_cmd("details");
    assert!(details.contains("comp1@0.0.2"));
    assert!(details.contains("comp2@0.0.2"));

    // 2. should update the dependencies and the flattenedDependencies of the dependent with the new versions
    let bar_foo = parse(&helper.cat_component("comp2@0.0.2"));
    assert_eq!(bar_foo["dependencies"][0]["id"]["name"].as_str().unwrap(), "comp3");
    assert_eq!(bar_foo["dependencies"][0]["id"]["version"].as_str().unwrap(), "0.0.2");
    assert!(
        bar_foo["flattenedDependencies"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!({ "scope": helper.scopes.remote, "name": "comp3", "version": "0.0.2" })),
    );

    // 3. should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions
    let comp1 = parse(&helper.cat_component("comp1@0.0.2"));
    assert_eq!(comp1["dependencies"][0]["id"]["name"].as_str().unwrap(), "comp2");
    assert_eq!(comp1["dependencies"][0]["id"]["version"].as_str().unwrap(), "0.0.2");
    let flat = comp1["flattenedDependencies"].as_array().unwrap();
    assert!(flat.contains(
        &serde_json::json!({ "scope": helper.scopes.remote, "name": "comp3", "version": "0.0.2" })
    ));
    assert!(flat.contains(
        &serde_json::json!({ "scope": helper.scopes.remote, "name": "comp2", "version": "0.0.2" })
    ));

    // 4. bit-status should show them all as staged and not modified
    let status = helper.status_json();
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    let staged: Vec<&str> = status["stagedComponents"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|item| item["id"].as_str())
        .collect();
    assert!(
        staged
            .iter()
            .any(|s| s.ends_with("comp1")),
    );
    assert!(
        staged
            .iter()
            .any(|s| s.ends_with("comp2")),
    );
    assert!(
        staged
            .iter()
            .any(|s| s.ends_with("comp3")),
    );

    // with --skip-auto-tag
    helper.get_cloned_workspace(&before_auto_tag);
    let tag_output = helper.tag_Without_Build_id("comp3", "--skip-auto-tag");
    // 5. should not auto tag the dependencies
    assert!(!tag_output.contains("auto-tagged dependents"));
    assert!(!tag_output.contains("comp1@0.0.2"));
    assert!(!tag_output.contains("comp2@0.0.2"));

    // 6. bitmap should show the correct versions
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str().unwrap(), "0.0.1");
    assert_eq!(bitmap["comp2"]["version"].as_str().unwrap(), "0.0.1");
    assert_eq!(bitmap["comp3"]["version"].as_str().unwrap(), "0.0.2");
}

#[test]
fn with_cyclic_dependencies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;
    helper.write_file("a/b/b.js", &format!("require('@{remote}/a.c');"));
    helper.write_file("a/c/c.js", &format!("require('@{remote}/a.b'); console.log('im c v1');"));
    helper.write_file("a/a/a.js", &format!("require('@{remote}/a.b');"));
    helper.add_component("a/*", "--namespace a");
    helper.link("");
    helper.tag_all_without_build("--ignore-issues=CircularDependencies");
    helper.write_file("a/c/c.js", &format!("require('@{remote}/a.b'); console.log('im c v2');"));
    let before_tag = helper.clone_workspace();

    // 1. bit status should recognize the auto tag pending components
    let status = helper.status_json();
    assert_eq!(
        status["autoTagPendingComponents"],
        serde_json::json!([format!("{remote}/a/a"), format!("{remote}/a/b"),]),
    );

    // tagging the components with auto-version-bump
    let tag_output = helper.tag_all_without_build("--ignore-issues=CircularDependencies");
    // 2. should auto tag all dependents
    assert!(tag_output.contains("3 component(s) tagged"));
    assert!(tag_output.contains("a/c@0.0.2"));
    assert!(tag_output.contains("auto-tagged dependents"));
    let details = helper.run_cmd("details");
    assert!(details.contains("a/a@0.0.2"));
    assert!(details.contains("a/b@0.0.2"));

    // 3. should update the dependencies and the flattenedDependencies of the all dependents with the new versions
    let comp_a = parse(&helper.cat_component("a/a@0.0.2"));
    assert_eq!(
        comp_a["dependencies"][0]["id"],
        serde_json::json!({ "scope": remote, "name": "a/b", "version": "0.0.2" }),
    );
    let comp_b = parse(&helper.cat_component("a/b@0.0.2"));
    assert_eq!(
        comp_b["dependencies"][0]["id"],
        serde_json::json!({ "scope": remote, "name": "a/c", "version": "0.0.2" }),
    );

    // 4. should update the dependencies and the flattenedDependencies of the modified component with the cycle dependency
    let comp_c = parse(&helper.cat_component("a/c@0.0.2"));
    assert_eq!(
        comp_c["dependencies"][0]["id"],
        serde_json::json!({ "scope": remote, "name": "a/b", "version": "0.0.2" }),
    );

    // tagging the components with a specific version
    helper.get_cloned_workspace(&before_tag);
    let tag_output =
        helper.tag_all_without_build("--ver 2.0.0 --ignore-issues=CircularDependencies");
    // 5. should auto tag all dependents
    assert!(tag_output.contains("3 component(s) tagged"));
    assert!(tag_output.contains("a/c@2.0.0"));
    assert!(tag_output.contains("auto-tagged dependents"));
    let details = helper.run_cmd("details");
    assert!(details.contains("a/a@0.0.2"));
    assert!(details.contains("a/b@0.0.2"));

    // 6. should update the dependencies and the flattenedDependencies of the all dependents with the new versions
    let comp_a = parse(&helper.cat_component("a/a@0.0.2"));
    assert_eq!(
        comp_a["dependencies"][0]["id"],
        serde_json::json!({ "scope": remote, "name": "a/b", "version": "0.0.2" }),
    );
    let comp_b = parse(&helper.cat_component("a/b@0.0.2"));
    assert_eq!(
        comp_b["dependencies"][0]["id"],
        serde_json::json!({ "scope": remote, "name": "a/c", "version": "2.0.0" }),
    );

    // 7. should update the dependencies and the flattenedDependencies of the modified component according to the specified version
    let comp_c = parse(&helper.cat_component("a/c@2.0.0"));
    assert_eq!(
        comp_c["dependencies"][0]["id"],
        serde_json::json!({ "scope": remote, "name": "a/b", "version": "0.0.2" }),
    );

    // 8. exporting the component: should be successful
    let export_output = helper.export("");
    assert!(export_output.contains("exported components (3)"), "{export_output}");
}

#[test]
fn with_same_component_as_direct_and_indirect_dependent() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;
    helper.write_file("a/a/a.js", &format!("require('@{remote}/a.b'); require('@{remote}/a.c');"));
    helper.write_file("a/b/b.js", &format!("require('@{remote}/a.c');"));
    helper.write_file("a/c/c.js", "console.log('im c v1');");
    helper.add_component("a/*", "--namespace a");
    helper.link("");
    helper.tag_all_without_build("");
    helper.export("");

    helper.write_file("a/c/c.js", "console.log('im c v2');");

    // 1. bit-status should show the auto-tagged pending
    let status = helper.status_json();
    let auto_tag = status["autoTagPendingComponents"].as_array().unwrap();
    assert!(auto_tag.contains(&serde_json::json!(format!("{remote}/a/a"))));
    assert!(auto_tag.contains(&serde_json::json!(format!("{remote}/a/b"))));

    // 2. tagging the dependency: should bump the component version that is direct and indirect dependent only once
    helper.tag_Without_Build_id("a/c", "");
    let comp_a = parse(&helper.cat_component("a/a"));
    let versions: Vec<&String> = comp_a["versions"]
        .as_object()
        .unwrap()
        .keys()
        .collect();
    assert_eq!(versions, vec!["0.0.1", "0.0.2"]);
}
