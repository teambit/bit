use super::command;
use crate::{
    commands::{diff_completion::http, move_paths::support},
    helper::{Helper, remote},
};
use std::fmt::Write;

pub(super) fn graph() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(4, true, "");
    for (name, dependency) in
        [("comp-a", Some("comp4")), ("comp-a2", Some("comp3")), ("comp-b", None)]
    {
        let source = dependency.map_or_else(
            || "module.exports=1;\n".into(),
            |dependency| format!("require('@{}/{dependency}');\n", helper.scopes.remote),
        );
        helper.output_file(&format!("{name}/index.js"), &source);
        support::setup(&helper, &format!("add {name} -i {name}"));
    }
    let source = helper.scopes.local_path.join("comp1/index.js");
    let mut contents = std::fs::read_to_string(&source).unwrap();
    for name in ["comp-a", "comp-a2", "comp-b"] {
        write!(contents, "\nrequire('@{}/{name}');", helper.scopes.remote).unwrap();
    }
    std::fs::write(source, contents).unwrap();
    support::setup(&helper, "link");
    support::setup(&helper, "compile");
    support::tag(&helper);
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    support::setup(&helper, &command(&helper, "comp1", ""));
    helper
}
#[test]
fn silent_dependents_imports_all_paths_to_the_workspace_without_unrelated_branches() {
    let helper = graph();
    super::successful(&helper, &command(&helper, "comp4", "--dependents --silent"));
    assert_components(&helper, &["comp1", "comp2", "comp3", "comp4", "comp-a", "comp-a2"]);
}
#[test]
fn silent_dependents_via_limits_paths_to_the_requested_intermediate_component() {
    let helper = graph();
    let flags = format!("--dependents-via {}/comp2 --silent", helper.scopes.remote);
    super::successful(&helper, &command(&helper, "comp4", &flags));
    assert_components(&helper, &["comp1", "comp2", "comp3", "comp4"]);
}
#[test]
fn http_dependents_all_with_silent_uses_the_same_complete_graph_paths() {
    let helper = graph();
    let _server = http::start(&helper);
    super::successful(
        &helper,
        &command(&helper, "comp4", "--dependents --dependents-all --silent"),
    );
    assert_components(&helper, &["comp1", "comp2", "comp3", "comp4", "comp-a", "comp-a2"]);
}
pub(super) fn assert_components(helper: &Helper, expected: &[&str]) {
    let bitmap = support::bitmap(helper);
    let mut actual = bitmap
        .as_object()
        .unwrap()
        .values()
        .filter_map(|row| row["name"].as_str())
        .collect::<Vec<_>>();
    actual.sort_unstable();
    let mut expected = expected.to_vec();
    expected.sort_unstable();
    assert_eq!(actual, expected);
}

#[test]
fn silent_dependents_uses_modified_workspace_direct_dependencies_instead_of_stored_edges() {
    let helper = graph();
    restrict_workspace_source(&helper);
    super::successful(&helper, &command(&helper, "comp4", "--dependents --silent"));
    assert_components(&helper, &["comp1", "comp2", "comp3", "comp4"]);
}
pub(super) fn restrict_workspace_source(helper: &Helper) {
    let entry = support::bitmap(helper)["comp1"].clone();
    std::fs::write(
        super::file(helper, &entry, "index.js"),
        format!("module.exports=require('@{}/comp2');\n", helper.scopes.remote),
    )
    .unwrap();
}

#[test]
fn dependents_all_without_silent_delegates_before_the_released_confirmation_prompt() {
    let helper = graph();
    let result = support::compare_declined(
        &helper,
        &command(&helper, "comp4", "--dependents-all"),
        super::output::durations,
    );
    assert!(result.stdout.contains("Would you like to continue with the import?"));
    assert!(result.status.success());
    assert_components(&helper, &["comp1"]);
}
