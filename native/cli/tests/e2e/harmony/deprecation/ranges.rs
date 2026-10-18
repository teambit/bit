use super::{DEPRECATION, listed};
use crate::{
    commands::move_paths::support::{self, aspect, json, successful},
    helper::{Helper, remote},
};
fn two_versions() -> Helper {
    let helper = support::workspace(2, true);
    helper.append_file("comp1/index.js", "\n// second\n");
    helper.append_file("comp2/index.js", "\n// second\n");
    support::tag(&helper);
    helper
}
#[test]
fn unstaged_ranges_are_reflected_in_log_and_undeprecation_clears_them() {
    let helper = two_versions();
    successful(&helper, "deprecate comp1 --range 0.0.1");
    assert_log(&helper, "0.0.1", true);
    assert_log(&helper, "0.0.2", false);
    successful(&helper, "undeprecate comp1");
    assert_log(&helper, "0.0.1", false);
}
fn assert_log(helper: &Helper, tag: &str, deprecated: bool) {
    let log = json(helper, "log comp1 --json");
    let version = log
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["tag"] == tag)
        .unwrap();
    assert_eq!(version["deprecated"], deprecated);
}
#[test]
fn undeprecation_clears_a_range_even_when_deprecate_boolean_is_false() {
    let helper = support::workspace(1, true);
    successful(&helper, r#"deprecate comp1 --range "<1.0.0""#);
    let result = successful(&helper, r#"undeprecate "**""#);
    assert!(result.stdout.contains("undeprecated successfully"));
    let config = aspect(&helper, "comp1", DEPRECATION).unwrap();
    assert_eq!(config["deprecate"], false);
    assert!(config.get("range").is_none());
}
#[test]
fn persisted_ranges_deprecate_only_selected_versions_and_imports_report_them() {
    let helper = support::workspace(2, true);
    helper.append_file("comp2/index.js", "\n// second\n");
    successful(&helper, "deprecate comp2 --range 0.0.1");
    support::tag(&helper);
    remote::publish(&helper);
    assert_eq!(support::show(&helper, "comp2", "deprecated")["isDeprecate"], false);
    assert_eq!(support::show(&helper, "comp2@0.0.1", "deprecated")["isDeprecate"], true);
    assert_eq!(support::show(&helper, "comp2@0.0.1", "deprecated")["range"], "0.0.1");
    assert_eq!(listed(&helper, "comp2")["deprecated"], false);
    let saved = helper.clone_workspace();
    helper.re_init_workspace();
    helper.add_remote_scope();
    assert!(
        !support::setup(&helper, &format!("import {}/comp2 -x", helper.scopes.remote))
            .contains("deprecated"),
    );
    assert!(
        support::setup(
            &helper,
            &format!("import {}/comp2@0.0.1 -x --override", helper.scopes.remote)
        )
        .contains("deprecated"),
    );
    helper.get_cloned_workspace(&saved);
    successful(&helper, "undeprecate comp2");
    let previous = support::show(&helper, "comp2@0.0.1", "deprecated");
    assert_eq!(previous["isDeprecate"], false);
    assert!(previous.get("range").is_none());
}
#[test]
fn ranges_covering_current_version_stop_applying_after_a_major_release() {
    let helper = support::workspace(1, true);
    successful(&helper, r#"deprecate comp1 --range "<1.0.0""#);
    support::tag(&helper);
    assert_eq!(support::show(&helper, "comp1", "deprecated")["isDeprecate"], true);
    assert_eq!(support::show(&helper, "comp1", "deprecated")["range"], "<1.0.0");
    support::setup(&helper, "tag --ver 2.0.0 --unmodified --ignore-issues * --message major");
    assert_eq!(support::show(&helper, "comp1", "deprecated")["isDeprecate"], false);
}
