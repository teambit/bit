mod compression;
use super::{empty, exported, lane};
use crate::{commands::move_paths::support, helper::remote};

#[test]
fn workspace_only_switches_existing_component_without_adding_new_lane_rows() {
    let helper = exported(2);
    empty(&helper);
    support::setup(&helper, &format!("import {}/comp1 -x", helper.scopes.remote));
    let output =
        two_write_success(&helper, &format!("switch {} --workspace-only -x", lane(&helper)));
    assert!(output.stdout.contains("successfully switched 1 components"), "{}", output.stdout);
    let bitmap = support::bitmap(&helper);
    assert!(bitmap.get("comp1").is_some());
    assert!(bitmap.get("comp2").is_none());
}

#[test]
fn ordinary_switch_adds_components_omitted_by_workspace_only() {
    let helper = exported(2);
    empty(&helper);
    support::setup(&helper, &format!("import {}/comp1 -x", helper.scopes.remote));
    two_write_success(&helper, &format!("switch {} -x", lane(&helper)));
    assert!(support::bitmap(&helper).get("comp2").is_some());
}

#[test]
fn main_switch_reports_components_not_snapped_on_the_lane_as_skipped() {
    let helper = support::workspace(2, true);
    remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    support::setup(&helper, "snap comp1 --unmodified --ignore-issues * --message lane");
    remote::publish(&helper);
    let output = two_write_success(&helper, "switch main -x");
    assert!(output.stdout.contains("1 skipped component(s)"), "{}", output.stdout);
    let details = support::setup(&helper, "details");
    assert!(details.contains("comp2"), "{details}");
}

#[test]
fn pattern_on_populated_workspace_preserves_the_full_error_prefix() {
    let helper = exported(2);
    support::setup(&helper, "switch main -x");
    let before = support::bitmap(&helper);
    let output = support::compare(&helper, &format!("switch {} -p **/comp1 -x", lane(&helper)));
    assert!(!output.status.success(), "{}", output.stdout);
    assert_eq!(support::bitmap(&helper), before);
}

#[test]
fn workspace_only_does_not_suggest_restoring_a_removed_lane_component() {
    let helper = exported(2);
    support::setup(&helper, "delete comp2 --silent --lane");
    support::setup(&helper, "snap --ignore-issues * --message removed");
    remote::publish(&helper);
    empty(&helper);
    support::setup(&helper, &format!("import {}/comp1 -x", helper.scopes.remote));
    let output =
        two_write_success(&helper, &format!("switch {} --workspace-only -x", lane(&helper)));
    assert!(!output.stdout.contains("omit --workspace-only"), "{}", output.stdout);
    assert!(support::bitmap(&helper).get("comp2").is_none());
}

#[test]
fn main_keeps_lane_only_rows_unavailable_after_main_was_merged_elsewhere() {
    let helper = support::workspace(1, false);
    support::setup(&helper, "lane create dev");
    support::setup(&helper, "snap --ignore-issues * --message lane");
    remote::publish(&helper);
    let lane_workspace = helper.clone_workspace();
    support::setup(&helper, "switch main -x");
    support::setup(&helper, "lane merge dev -x --message merge");
    remote::publish(&helper);
    helper.get_cloned_workspace(&lane_workspace);
    support::successful(&helper, "switch main --skip-fetch -x");
    support::setup(&helper, "import -x");
    let status = support::json(&helper, "status --json");
    assert_eq!(
        status["unavailableOnMain"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert!(
        support::json(&helper, "list --json")
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

fn advanced_lane(removed: bool) -> crate::helper::Helper {
    let helper = super::exported(1);
    let author = helper.clone_workspace();
    empty(&helper);
    support::setup(&helper, &format!("lane import {} -x", lane(&helper)));
    let reader = helper.clone_workspace();
    helper.get_cloned_workspace(&author);
    helper.output_file("comp2/index.js", "module.exports='new lane component';\n");
    support::setup(&helper, "add comp2 -i comp2");
    support::setup(&helper, "snap --ignore-issues * --message new-component");
    remote::publish(&helper);
    if removed {
        support::setup(&helper, "delete comp2 --silent --lane");
        support::setup(&helper, "snap --ignore-issues * --message removed-component");
        remote::publish(&helper);
    }
    helper.get_cloned_workspace(&reader);
    support::setup(&helper, "import -x");
    helper
}

#[test]
fn checkout_workspace_only_omits_new_lane_rows_and_ordinary_checkout_adds_them() {
    let helper = advanced_lane(false);
    let baseline = helper.clone_workspace();
    let output = checkout(&helper, "checkout head --workspace-only -x");
    assert!(output.stdout.contains("omit --workspace-only flag to add them"));
    assert!(support::bitmap(&helper).get("comp2").is_none());
    helper.get_cloned_workspace(&baseline);
    checkout(&helper, "checkout head -x");
    assert!(support::bitmap(&helper).get("comp2").is_some());
}

#[test]
fn checkout_workspace_only_does_not_offer_a_removed_new_component() {
    let helper = advanced_lane(true);
    let output = checkout(&helper, "checkout head --workspace-only -x");
    assert!(!output.stdout.contains("omit --workspace-only"));
    assert!(!output.stdout.contains("comp2"));
    assert!(support::bitmap(&helper).get("comp2").is_none());
}

fn checkout(helper: &crate::helper::Helper, command: &str) -> crate::helper::Run {
    let output = support::compare_with_stdout(helper, command, super::output::durations);
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    output
}

#[test]
fn empty_workspace_bracket_pattern_selects_only_matching_lane_components() {
    let helper = exported(4);
    empty(&helper);
    let output = two_write_success(
        &helper,
        &format!("switch {} --pattern {}/comp[13] -x", lane(&helper), helper.scopes.remote),
    );
    let bitmap = support::bitmap(&helper);
    assert!(bitmap.get("comp1").is_some());
    assert!(bitmap.get("comp3").is_some());
    assert!(bitmap.get("comp2").is_none());
    assert!(bitmap.get("comp4").is_none());
    assert!(!output.stdout.contains("skipped component"), "{}", output.stdout);
    assert!(!output.stdout.contains("comp2"), "{}", output.stdout);
    assert!(!output.stdout.contains("comp4"), "{}", output.stdout);
}

pub(super) fn two_write_success(
    helper: &crate::helper::Helper,
    command: &str,
) -> crate::helper::Run {
    let output = crate::commands::add::support::history_oracle::compare(
        helper,
        command,
        str::to_owned,
        ["checkout", "lane-switch"],
        false,
    );
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    output
}
