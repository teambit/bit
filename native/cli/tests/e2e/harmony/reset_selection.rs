//! Reset component patterns publish a single coherent selected batch.
use crate::helper::{Helper, config};
use std::ffi::OsStr;

fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(3, true, "");
    for index in 1..=3 {
        helper.output_file(
            &format!("comp{index}/index.js"),
            &format!("module.exports = 'independent {index}';"),
        );
    }
    helper.tag_without_build("", "--message first");
    for index in 1..=3 {
        helper.append_file(&format!("comp{index}/index.js"), "\n// second");
    }
    helper.tag_without_build("", "--message second");
    helper
}

fn compare(helper: &Helper, command: &str) {
    let oracle = helper.clone_workspace();
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
    let list = "list --local-scope --json";
    let expected = Helper::cmd_in_with(&oracle, list, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual =
        Helper::cmd_in_with(&helper.scopes.local_path, list, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(actual.stdout, expected.stdout);
}

#[test]
fn main_reset_globs_and_head_batches_match_node() {
    let helper = workspace();
    let baseline = helper.clone_workspace();
    for command in ["reset **/comp[13]*", "reset **/comp*,!**/comp2 --head", "reset --all --head"] {
        helper.get_cloned_workspace(&baseline);
        compare(&helper, command);
    }
}

#[test]
fn soft_reset_patterns_and_scoped_names_match_node() {
    let helper = workspace();
    helper.run("tag --soft --unmodified --message pending");
    let baseline = helper.clone_workspace();
    for command in ["reset **/comp[13]* --soft", "reset my-scope/comp1 --soft"] {
        helper.get_cloned_workspace(&baseline);
        compare(&helper, command);
    }
}

#[test]
fn force_resets_selected_dependents_together() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "--message first");
    compare(&helper, "reset **/comp* --force");
}

#[test]
fn reset_modified_state_and_soft_tagged_predicates_match_node() {
    let helper = workspace();
    helper.append_file("comp1/index.js", "\n// local edit");
    let baseline = helper.clone_workspace();
    compare(&helper, "reset $modified --head");
    helper.get_cloned_workspace(&baseline);
    helper.run("tag --soft --unmodified --message pending");
    compare(&helper, "reset $softTagged --soft");
}

#[test]
fn selected_lane_snap_heads_reset_as_one_batch() {
    let helper = workspace();
    helper.run("lane create selected-reset");
    for index in 1..=3 {
        helper.append_file(&format!("comp{index}/index.js"), "\n// lane edit");
    }
    helper.run("snap --message lane-snapshot");
    compare(&helper, "reset **/comp[13]* --head --force");
}

#[test]
fn selected_reset_includes_staged_deleted_components() {
    let helper = workspace();
    helper.run("delete comp2 --silent");
    let baseline = helper.clone_workspace();
    compare(&helper, "reset **/comp* --head --force");
    helper.get_cloned_workspace(&baseline);
    helper.tag_without_build("", "--message removed");
    compare(&helper, "reset **/comp* --head --force");
}
