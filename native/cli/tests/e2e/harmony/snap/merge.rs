//! `local and remote do not have the same head` section of `e2e/harmony/snap.e2e.ts`.

use super::remote_ref_head;
use crate::helper::{Helper, len, parse};
use serde_json::json;
use std::path::{Path, PathBuf};

const FOO_V2: &str = "module.exports = function foo() { return 'got foo v2'; }";
const FOO_V3: &str = "module.exports = function foo() { return 'got foo v3'; }";

struct DivergedSetup {
    helper: Helper,
    scope_after_first_snap: PathBuf,
    first_snap: String,
    second_snap: String,
    local_head: String,
    local_scope: PathBuf,
}

fn setup_diverged() -> DivergedSetup {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.native("snap bar/foo --skip-tests");
    let first_snap = helper.get_head("bar/foo");
    helper.native("export");
    let scope_after_first_snap = helper.clone_workspace();
    helper.create_component_bar_foo(FOO_V2);
    helper.native("snap bar/foo --skip-tests");
    let second_snap = helper.get_head("bar/foo");
    helper.native("export");

    helper.get_cloned_workspace(&scope_after_first_snap);
    helper.create_component_bar_foo(FOO_V3);
    helper.native("snap --skip-tests");
    let local_head = helper.get_head("bar/foo");
    let local_scope = helper.clone_workspace();

    DivergedSetup {
        helper,
        scope_after_first_snap,
        first_snap,
        second_snap,
        local_head,
        local_scope,
    }
}

fn expect_bitmap_version(helper: &Helper, name: &str, version: &str) {
    let bitmap = helper.read_bit_map();
    let key = format!("{}/{name}", helper.scopes.remote);
    let actual = bitmap
        .get(&key)
        .or_else(|| bitmap.get(name))
        .and_then(|entry| entry["version"].as_str());
    assert_eq!(actual, Some(version), "bitmap mismatch for {name}: {bitmap}");
}

#[test]
fn local_behind_remote_and_diverged_import() {
    let state = setup_diverged();
    let helper = &state.helper;

    helper.get_cloned_workspace(&state.scope_after_first_snap);
    helper.import_component("bar/foo", "--objects");
    assert_eq!(remote_ref_head(helper, "bar/foo"), state.second_snap);
    expect_bitmap_version(helper, "bar/foo", &state.first_snap);
    let status_out = helper.status();
    assert!(status_out.contains("pending updates"));
    assert!(status_out.contains(&state.first_snap));
    assert!(status_out.contains(&state.second_snap));

    helper.get_cloned_workspace(&state.scope_after_first_snap);
    helper.import_component("bar/foo", "");
    assert_eq!(remote_ref_head(helper, "bar/foo"), state.second_snap);
    expect_bitmap_version(helper, "bar/foo", &state.second_snap);
    helper.expect_status_to_be_clean_except(&["snappedComponents"]);

    helper.get_cloned_workspace(&state.local_scope);
    let export_run = helper.try_cmd("export");
    assert!(!export_run.status.success());
    let export_err = format!("{}\n{}", export_run.stdout, export_run.stderr);
    assert!(export_err.contains("merge error occurred when exporting"));

    assert_diverged_import_flags(&state);
}

fn assert_diverged_import_flags(state: &DivergedSetup) {
    let helper = &state.helper;
    helper.import_component("bar/foo", "--objects");
    assert_eq!(helper.get_head("bar/foo"), state.local_head);
    assert_eq!(remote_ref_head(helper, "bar/foo"), state.second_snap);
    let status = helper.status_json();
    assert_eq!(len(&status["mergePendingComponents"]), 1);
    assert_eq!(len(&status["outdatedComponents"]), 0);
    assert_eq!(len(&status["newComponents"]), 0);
    assert_eq!(len(&status["modifiedComponents"]), 0);
    assert_eq!(len(&status["invalidComponents"]), 0);

    helper.get_cloned_workspace(&state.local_scope);
    let import_run = helper.try_cmd(&format!("import {}/bar/foo", helper.scopes.remote));
    assert!(!import_run.status.success());
    let import_err = format!("{}\n{}", import_run.stdout, import_run.stderr);
    assert!(import_err.contains("--merge"));
}

#[test]
fn diverged_merge_ours_and_theirs() {
    let state = setup_diverged();
    let helper = &state.helper;

    helper.get_cloned_workspace(&state.local_scope);
    helper.import_component("bar/foo", "--objects");
    let before_merge_scope = helper.clone_workspace();
    let before_merge_head = helper.get_head("bar/foo");

    let merge_ours = helper.run("merge bar/foo --auto-merge-resolve ours");
    assert!(!merge_ours.contains("components with file changes"));
    assert!(merge_ours.contains("merge-snapped components"));
    assert_eq!(helper.read_file("bar/foo.js"), FOO_V3);
    assert_merge_snap_version(helper, &state.local_head, &state.second_snap);

    helper.get_cloned_workspace(&before_merge_scope);
    assert_merge_ours_no_snap_and_resolve(helper, &before_merge_head);

    helper.get_cloned_workspace(&state.local_scope);
    helper.import_component("bar/foo", "--objects");
    let merge_theirs = helper.run("merge bar/foo --auto-merge-resolve theirs");
    assert!(merge_theirs.contains("updated"));
    assert_eq!(helper.read_file("bar/foo.js"), FOO_V2);
    assert_merge_snap_version(helper, &state.local_head, &state.second_snap);
}

fn assert_merge_snap_version(helper: &Helper, local_head: &str, second_snap: &str) {
    let latest = parse(&helper.cat_component(&format!("{}/bar/foo@latest", helper.scopes.remote)));
    let parents = latest["parents"].as_array().unwrap();
    assert_eq!(parents.len(), 2);
    assert!(parents.contains(&json!(second_snap)));
    assert!(parents.contains(&json!(local_head)));
    let msg = latest["log"]["message"].as_str().unwrap();
    assert!(msg.contains(&format!("merge {}/main", helper.scopes.remote)));
    assert!(msg.contains("main"));
    let head = helper.get_head("bar/foo");
    expect_bitmap_version(helper, "bar/foo", &head);
}

fn assert_merge_ours_no_snap_and_resolve(helper: &Helper, before_merge_head: &str) {
    let merge_no_snap = helper.run("merge bar/foo --auto-merge-resolve ours --no-snap");
    assert!(!merge_no_snap.contains("components with file changes"));
    assert!(!merge_no_snap.contains("merge-snapped components"));
    assert_eq!(helper.read_file("bar/foo.js"), FOO_V3);
    let latest = parse(&helper.cat_component(&format!("{}/bar/foo@latest", helper.scopes.remote)));
    assert_eq!(
        latest["parents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let status = helper.status_json();
    assert_eq!(len(&status["componentsDuringMergeState"]), 1);
    assert_eq!(len(&status["mergePendingComponents"]), 0);
    expect_bitmap_version(helper, "bar/foo", before_merge_head);

    let resolve_out = helper.run("merge bar/foo --resolve");
    assert!(resolve_out.contains("resolved components"));
    let status_after = helper.status_json();
    assert_eq!(len(&status_after["componentsDuringMergeState"]), 0);
    assert_eq!(len(&status_after["modifiedComponents"]), 0);
    assert_eq!(len(&status_after["outdatedComponents"]), 0);
    assert_eq!(len(&status_after["mergePendingComponents"]), 0);
    assert_eq!(len(&status_after["stagedComponents"]), 1);
    let resolved_ver =
        parse(&helper.cat_component(&format!("{}/bar/foo@latest", helper.scopes.remote)));
    assert_eq!(
        resolved_ver["parents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    let head = helper.get_head("bar/foo");
    expect_bitmap_version(helper, "bar/foo", &head);
}

#[test]
fn diverged_merge_manual() {
    let state = setup_diverged();
    let helper = &state.helper;

    helper.get_cloned_workspace(&state.local_scope);
    helper.import_component("bar/foo", "--objects");
    let merge_output = helper.run("merge bar/foo --manual");
    let scope_with_conflicts = helper.clone_workspace();

    assert!(merge_output.contains("CONFLICT"));
    let content = helper.read_file("bar/foo.js");
    assert!(content.contains(&format!("<<<<<<< {} (current)", state.local_head)));
    assert!(content.contains(FOO_V3));
    assert!(content.contains("======="));
    assert!(content.contains(FOO_V2));
    assert!(content.contains(&format!(">>>>>>> {} (incoming)", state.second_snap)));
    expect_bitmap_version(helper, "bar/foo", &state.local_head);
    assert_eq!(helper.get_head("bar/foo"), state.local_head);

    let status = helper.status_json();
    assert_eq!(len(&status["componentsDuringMergeState"]), 1);
    assert_eq!(len(&status["modifiedComponents"]), 1);
    assert_eq!(len(&status["outdatedComponents"]), 0);
    assert_eq!(len(&status["mergePendingComponents"]), 0);

    let checkout_run = helper.try_cmd(&format!("checkout {} bar/foo --manual", state.first_snap));
    assert!(!checkout_run.status.success());
    let checkout_err = format!("{}\n{}", checkout_run.stdout, checkout_run.stderr);
    assert!(checkout_err.contains("is in during-merge state"));

    assert_manual_tag_snap_remove_reset(&state, &scope_with_conflicts);
    assert_manual_resolve_and_abort(&state, &scope_with_conflicts);
}

fn assert_manual_tag_snap_remove_reset(state: &DivergedSetup, scope_with_conflicts: &Path) {
    let helper = &state.helper;

    helper.get_cloned_workspace(scope_with_conflicts);
    helper.create_component_bar_foo("");
    let tag_out = helper.tag_Without_Build_id("bar/foo", "");
    assert!(tag_out.contains(&format!("{}/bar/foo@0.0.1", helper.scopes.remote)));
    assert_two_parents(helper, &state.local_head, &state.second_snap);

    helper.get_cloned_workspace(scope_with_conflicts);
    helper.create_component_bar_foo("");
    let tag_all = helper.tag_all_without_build("");
    assert!(!tag_all.contains("nothing to tag"));
    assert_two_parents(helper, &state.local_head, &state.second_snap);

    helper.get_cloned_workspace(scope_with_conflicts);
    helper.create_component_bar_foo("");
    helper.native("snap bar/foo --skip-tests");
    assert_two_parents(helper, &state.local_head, &state.second_snap);

    helper.get_cloned_workspace(scope_with_conflicts);
    helper.remove_component("bar/foo", "-f --silent");
    assert!(!helper.status().contains("bar/foo"));

    helper.get_cloned_workspace(scope_with_conflicts);
    helper.output_file("bar/foo.js", "");
    helper.untag("bar/foo");
    let status = helper.status_json();
    assert_eq!(len(&status["componentsDuringMergeState"]), 0);
    assert_eq!(len(&status["modifiedComponents"]), 1);
    assert_eq!(len(&status["mergePendingComponents"]), 0);
    assert_eq!(len(&status["stagedComponents"]), 0);
}

fn assert_manual_resolve_and_abort(state: &DivergedSetup, scope_with_conflicts: &Path) {
    let helper = &state.helper;

    helper.get_cloned_workspace(scope_with_conflicts);
    helper.create_component_bar_foo(FOO_V3);
    let resolve_out = helper.run("merge bar/foo --resolve");
    assert!(resolve_out.contains("resolved components"));
    let status = helper.status_json();
    assert_eq!(len(&status["componentsDuringMergeState"]), 0);
    assert_eq!(len(&status["modifiedComponents"]), 0);
    assert_eq!(len(&status["outdatedComponents"]), 0);
    assert_eq!(len(&status["mergePendingComponents"]), 0);
    assert_eq!(len(&status["stagedComponents"]), 1);
    assert_two_parents(helper, &state.local_head, &state.second_snap);
    let head = helper.get_head("bar/foo");
    expect_bitmap_version(helper, "bar/foo", &head);

    helper.get_cloned_workspace(scope_with_conflicts);
    let abort_out = helper.run("merge bar/foo --abort");
    assert!(abort_out.contains("merge aborted"));
    let abort_status = helper.status_json();
    assert_eq!(len(&abort_status["mergePendingComponents"]), 1);
    assert_eq!(len(&abort_status["componentsDuringMergeState"]), 0);
    assert_eq!(len(&abort_status["modifiedComponents"]), 0);
    assert_eq!(len(&abort_status["outdatedComponents"]), 0);
    assert_eq!(len(&abort_status["stagedComponents"]), 1);
    expect_bitmap_version(helper, "bar/foo", &state.local_head);
    assert_eq!(helper.read_file("bar/foo.js"), FOO_V3);
}

fn assert_two_parents(helper: &Helper, local_head: &str, second_snap: &str) {
    let latest = parse(&helper.cat_component(&format!("{}/bar/foo@latest", helper.scopes.remote)));
    let parents = latest["parents"].as_array().unwrap();
    assert_eq!(parents.len(), 2);
    assert!(parents.contains(&json!(second_snap)));
    assert!(parents.contains(&json!(local_head)));
}
