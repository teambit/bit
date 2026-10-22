//! `e2e/flows/cyclic-dependencies.e2e.ts`.

use crate::helper::{Helper, parse};
use std::ffi::OsStr;

#[test]
fn insights_circular_two_workspace_cycles_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let scope = &helper.scopes.remote;
    for (id, dependency) in [("a", "b"), ("b", "a"), ("c", "d"), ("d", "c")] {
        helper.write_file(
            &format!("{id}/index.js"),
            &format!("module.exports = require('@{scope}/{dependency}');"),
        );
        helper.add_component(id, "");
    }
    helper.link("");
    for command in ["insights circular --json", "insights circular"] {
        let native = helper.native_run(command);
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(native.status.success(), "{native:?}");
        assert!(node.status.success(), "{node:?}");
        if command.ends_with("--json") {
            assert_eq!(parse(&native.stdout), parse(&node.stdout));
        } else {
            assert_eq!(native.stdout, node.stdout);
        }
    }
}

#[test]
fn insights_circular_empty_workspace_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let native = helper.native_run("insights circular --json");
    assert!(native.native, "{}", native.trace);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(parse(&native.stdout), parse(&node.stdout));

    let native_text = helper.native_run("insights circular");
    let node_text = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(native_text.stdout, node_text.stdout);

    let colored = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular",
        &[("FORCE_COLOR", OsStr::new("1"))],
    );
    let node_colored = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular",
        &[("FORCE_COLOR", OsStr::new("1")), ("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(colored.native, "{}", colored.trace);
    assert_eq!(colored.stdout, node_colored.stdout);
}

#[test]
fn component_a_requires_b_component_b_requires_a() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;
    helper.write_file(
        "comp/a/a.js",
        &format!("const b = require('@{remote}/comp.b'); console.log(b());"),
    );
    helper.write_file(
        "comp/b/b.js",
        &format!("const a = require('@{remote}/comp.a'); console.log(a());"),
    );
    helper.add_component("comp/a", "--id comp/a");
    helper.add_component("comp/b", "--id comp/b");
    helper.link("");
    let tag_output = helper.tag_all_without_build("--ignore-issues=CircularDependencies");

    // 1. should be able to tag both with no errors
    assert!(tag_output.contains("2 component(s) tagged"));

    let native = helper.native_run("insights circular --json");
    assert!(native.native, "{}", native.trace);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    assert_eq!(parse(&native.stdout), parse(&node.stdout));

    let native_text = helper.native_run("insights circular");
    let node_text = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(native_text.stdout, node_text.stdout);

    let colored = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular",
        &[("FORCE_COLOR", OsStr::new("1"))],
    );
    let node_colored = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular",
        &[("FORCE_COLOR", OsStr::new("1")), ("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(colored.native, "{}", colored.trace);
    assert_eq!(colored.stdout, node_colored.stdout);

    // 2. should save the dependencies and flattenedDependencies of A correctly
    let comp_a = parse(&helper.cat_component("comp/a@0.0.1"));
    assert_eq!(
        comp_a["dependencies"][0]["id"],
        serde_json::json!({ "name": "comp/b", "scope": remote, "version": "0.0.1" }),
    );
    assert_eq!(
        comp_a["flattenedDependencies"][0],
        serde_json::json!({ "name": "comp/b", "scope": remote, "version": "0.0.1" }),
    );

    // 3. should save the dependencies and flattenedDependencies of B correctly
    let comp_b = parse(&helper.cat_component("comp/b@0.0.1"));
    assert_eq!(
        comp_b["dependencies"][0]["id"],
        serde_json::json!({ "name": "comp/a", "scope": remote, "version": "0.0.1" }),
    );
    assert_eq!(
        comp_b["flattenedDependencies"][0],
        serde_json::json!({ "name": "comp/a", "scope": remote, "version": "0.0.1" }),
    );

    // 4. exporting the component: should export successfully with no errors
    let export = helper.native_run("export");
    assert!(export.status.success(), "{export:?}");

    // 5. importing to a new environment: should import successfully and not throw any error
    helper.re_init_workspace();
    helper.add_remote_scope();
    let import_output = helper.import_component("comp/*", "-x");
    helper.link("");
    helper.compile();

    // 6. should bring in the components
    assert!(import_output.contains("successfully imported 2 components"));

    // 7. should not show a clean workspace (has CircularDependencies issue)
    helper.expect_status_to_have_issue("CircularDependencies");
}

#[test]
fn complex_case_with_a_long_chain_of_dependencies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = &helper.scopes.remote;

    helper.write_file(
        "comp/a1/a1.js",
        &format!(
            "const a2 = require('@{remote}/comp.a2'); const b1 = require('@{remote}/comp.b1');",
        ),
    );
    helper.write_file("comp/a2/a2.js", &format!("const a3 = require('@{remote}/comp.a3');"));
    helper.write_file("comp/a3/a3.js", "console.log('im leaf');");
    helper.write_file("comp/b1/b1.js", &format!("const b2 = require('@{remote}/comp.b2');"));
    helper.write_file(
        "comp/b2/b2.js",
        &format!(
            "const b3 = require('@{remote}/comp.b3'); const a1 = require('@{remote}/comp.a1');",
        ),
    );
    helper.write_file("comp/b3/b3.js", &format!("const b4 = require('@{remote}/comp.b4');"));
    helper.write_file(
        "comp/b4/b4.js",
        &format!("const isString = require('@{remote}/utils.is-string');"),
    );
    helper.add_component("comp/*", "--namespace comp");
    helper.create_component_utils_is_type("");
    helper.add_component_utils_is_type();
    helper.create_component_utils_is_string(&format!(
        "const isType = require('@{remote}/utils.is-type');\nmodule.exports = function isString() {{ return isType() + ' and got is-string'; }};\n",
    ));
    helper.add_component_utils_is_string();
    helper.link("");
    let tag_output = helper.tag_all_without_build("--ignore-issues=CircularDependencies");

    // 1. should be able to tag with no errors
    assert!(tag_output.contains("9 component(s) tagged"));

    // 2. bit insights should show the circular with the correct order: dependent -> dependency
    let run = helper.native_run("insights circular --json");
    assert!(run.native, "{}", run.trace);
    let insights = parse(&run.stdout);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    assert_eq!(insights, parse(&node.stdout));
    let native_text = helper.native_run("insights circular");
    let node_text = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(native_text.stdout, node_text.stdout);
    let native_deps = helper.native_run("insights circular --include-deps --json");
    let node_deps = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "insights circular --include-deps --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(parse(&native_deps.stdout), parse(&node_deps.stdout));
    let cycle = insights[0]["data"][0].as_array().unwrap();
    assert_eq!(
        cycle,
        &[
            serde_json::json!(format!("{remote}/comp/a1@0.0.1")),
            serde_json::json!(format!("{remote}/comp/b1@0.0.1")),
            serde_json::json!(format!("{remote}/comp/b2@0.0.1")),
            serde_json::json!(format!("{remote}/comp/a1@0.0.1")),
        ],
    );

    // 3. leaves (A3 and is-type) should not have any dependency
    for comp in ["comp/a3@0.0.1", "utils/is-type@0.0.1"] {
        let cat = parse(&helper.cat_component(comp));
        assert_eq!(
            cat["dependencies"]
                .as_array()
                .unwrap()
                .len(),
            0,
        );
        assert_eq!(
            cat["flattenedDependencies"]
                .as_array()
                .unwrap()
                .len(),
            0,
        );
    }

    // 4. A2 should have only A3 as a dependency and flattenedDependency
    let a2 = parse(&helper.cat_component("comp/a2@0.0.1"));
    assert_eq!(
        a2["dependencies"][0]["id"],
        serde_json::json!({ "name": "comp/a3", "scope": remote, "version": "0.0.1" }),
    );
    assert_eq!(
        a2["flattenedDependencies"],
        serde_json::json!([{ "name": "comp/a3", "scope": remote, "version": "0.0.1" }]),
    );

    // 5. A1 should have A2 and B1 as direct dependencies, and all the rest as flattenedDependencies
    let a1 = parse(&helper.cat_component("comp/a1@0.0.1"));
    assert_eq!(
        a1["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(
        a1["flattenedDependencies"]
            .as_array()
            .unwrap()
            .len(),
        8,
    );

    // 6. B2 should have A1 and B3 as direct dependencies, and all the rest as flattenedDependencies
    let b2 = parse(&helper.cat_component("comp/b2@0.0.1"));
    assert_eq!(
        b2["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(
        b2["flattenedDependencies"]
            .as_array()
            .unwrap()
            .len(),
        8,
    );

    // 7. B1 should have B2 as direct dependencies, and all the rest as flattenedDependencies
    let b1 = parse(&helper.cat_component("comp/b1@0.0.1"));
    assert_eq!(
        b1["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        b1["flattenedDependencies"]
            .as_array()
            .unwrap()
            .len(),
        8,
    );

    // 8. B3 should have B4 as direct dependencies, and B4, is-type, is-string as flattenedDependencies
    let b3 = parse(&helper.cat_component("comp/b3@0.0.1"));
    assert_eq!(
        b3["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        b3["flattenedDependencies"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    // 9. B4 should have is-string as a direct dependency, and is-type, is-string as flattenedDependencies
    let b4 = parse(&helper.cat_component("comp/b4@0.0.1"));
    assert_eq!(
        b4["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        b4["flattenedDependencies"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );

    // 10. exporting the component: should export successfully with no errors
    assert!(helper.native_run("export").status.success());

    // 11. importing to a new environment
    helper.re_init_workspace();
    helper.add_remote_scope();
    let import_output = helper.import_component("comp/*", "-x");
    assert!(import_output.contains("successfully imported 7 components"));
    helper.import_component("utils/*", "-x");
    helper.link("");
    helper.compile();
    helper.expect_status_to_have_issue("CircularDependencies");
}

#[test]
fn same_component_require_itself_and_modified_component_depends_on_previous_version() {
    // 1. same component require itself using module path
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.create_component_bar_foo(&format!("require('@{}/bar.foo');", helper.scopes.remote));

    // should block the tag by default
    let err = helper.try_cmd("tag --skip-tests");
    assert!(!err.status.success());

    // should tag successfully with --ignore-issues flag and should not save the component itself as a dependency
    let tag_output = helper.tag_all_without_build("--ignore-issues=SelfReference");
    assert!(tag_output.contains("1 component(s) tagged"));
    let cat = parse(&helper.cat_component("bar/foo@latest"));
    assert_eq!(
        cat["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    // 2. modified component depends on a non-workspace component that depends on its previous version
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.populate_components(2, true, "");
    helper2.tag_all_without_build("");
    helper2.export("");

    helper2.re_init_workspace();
    helper2.add_remote_scope();
    helper2.import_component("comp2", "-x");
    helper2.link("");
    helper2.import_component("comp1", "--objects");
    helper2.npm_add_fake_package(&format!("@{}/comp1", helper2.scopes.remote), "0.0.1", true);
    helper2.write_file(
        &format!("{}/comp2/index.js", helper2.scopes.remote),
        &format!(
            "const comp1 = require('@{}/comp1');\nmodule.exports = () => 'comp2 and ' + comp1();",
            helper2.scopes.remote,
        ),
    );

    helper2.expect_status_to_not_have_issue("CircularDependencies");
    let snap = helper2.try_cmd("snap --skip-tests");
    assert!(snap.status.success(), "{snap:?}");
}
