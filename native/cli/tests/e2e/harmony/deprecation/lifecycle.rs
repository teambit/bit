use super::DEPRECATION;
use crate::{
    commands::move_paths::support::{self, aspect, bitmap, json, successful},
    helper::{Helper, remote},
};
fn exported() -> Helper {
    let helper = support::workspace(3, true);
    successful(&helper, "deprecate comp2");
    support::tag(&helper);
    remote::publish(&helper);
    helper
}
#[test]
fn exported_deprecation_clears_bitmap_config_and_is_reported_by_remote_list_and_import() {
    let helper = exported();
    assert!(bitmap(&helper)["comp2"].get("config").is_none());
    let list = json(&helper, &format!("list {} --json", helper.scopes.remote));
    let component = list
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == format!("{}/comp2", helper.scopes.remote))
        .unwrap();
    assert_eq!(component["deprecated"], true);
    helper.re_init_workspace();
    helper.add_remote_scope();
    assert!(
        support::setup(&helper, &format!("import {}/comp2 -x", helper.scopes.remote))
            .contains("deprecated"),
    );
    assert_eq!(aspect(&helper, "comp2", DEPRECATION).unwrap()["deprecate"], true);
}
#[test]
fn wildcard_import_excludes_deprecated_components_unless_requested() {
    for include in [false, true] {
        let helper = exported();
        helper.re_init_workspace();
        helper.add_remote_scope();
        let option = if include { "--include-deprecated" } else { "" };
        let output =
            support::setup(&helper, &format!("import {}/* -x {option}", helper.scopes.remote));
        assert!(output.contains(if include { "3 components" } else { "2 components" }));
        assert_eq!(bitmap(&helper).get("comp2").is_some(), include);
    }
}
#[test]
fn deprecated_dependency_issues_follow_the_dependent_and_dependency_status() {
    let helper = support::workspace(2, false);
    helper.output_file(
        "comp1/index.js",
        &format!("module.exports=require('@{}/comp2');\n", helper.scopes.remote),
    );
    support::tag(&helper);
    successful(&helper, "deprecate comp2");
    support::tag(&helper);
    remote::publish(&helper);
    assert_dependency_issue(&helper, true);
    successful(&helper, "deprecate comp1");
    assert_dependency_issue(&helper, false);
    support::tag(&helper);
    remote::publish(&helper);
    assert_dependency_issue(&helper, false);
    successful(&helper, "undeprecate comp1");
    support::tag(&helper);
    remote::publish(&helper);
    assert_dependency_issue(&helper, true);
    successful(&helper, "undeprecate comp2");
    assert_dependency_issue(&helper, false);
}
fn assert_dependency_issue(helper: &Helper, present: bool) {
    let status = json(helper, "status --json");
    let found = status["componentsWithIssues"]
        .as_array()
        .unwrap()
        .iter()
        .any(|component| {
            component["issues"]
                .as_array()
                .unwrap()
                .iter()
                .any(|issue| issue["type"] == "DeprecatedDependencies")
        });
    assert_eq!(found, present);
}
