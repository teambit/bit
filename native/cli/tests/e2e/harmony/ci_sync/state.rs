//! E2E tests for `bit ci sync — state model v2`.
//!
//! Ported from:
//! - `e2e/harmony/ci-sync-state.e2e.ts`

use super::support::{
    branch_paths_matching, branch_side_commit, branch_tip_message, branch_tip_sha, comp1_src,
    comp2_src, create_lane_with_snap, file_on_branch, git_fetch, lane_side_edit, lane_tip_file,
    make_local_scope_cold, remote_branch_exists, remote_lane_fingerprint, run_bit_in,
    scope_object_count, seed_sync, setup_sync_workspace, sync_run,
};
use crate::helper::{Helper, setup};
use serde_json::json;
use std::{fs, io::Write};

#[test]
fn ci_sync_developer_snapping_and_exporting_from_branch_advances_state() {
    let helper = Helper::new();
    let lane = "dev-snap";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("lane-snap-1"))],
        "lane snap 1",
        "",
    );
    seed_sync(&helper, lane);

    // 1. should read the pair as CONVERGED when the developer already did the sync, and write nothing
    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {lane} origin/{lane}"));
    helper.output_file("comp2/index.js", &comp2_src("dev-snapped-on-branch"));
    helper.run(r#"snap --skip-tests --message "dev snaps comp2 on the branch""#);
    helper.export("");
    helper.git("add -A");
    helper.git(r#"commit -m "feat: snap comp2 from the branch""#);
    helper.git(&format!("push origin {lane}"));
    let dev_commit_sha = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    helper.git(&format!("checkout -f {default_branch}"));
    git_fetch(&helper);
    let lane_after_dev_work = remote_lane_fingerprint(&helper, lane);
    let branch_tip_after_dev_work = branch_tip_sha(&helper, lane);

    let changed = helper.git(&format!("show --stat --format= origin/{lane}"));
    assert!(changed.contains(".bitmap"), "files in the dev commit:\n{changed}");
    assert_eq!(branch_tip_after_dev_work, dev_commit_sha);

    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged")));
    assert!(!output.contains(&format!("{lane} -> merge-diverged")));
    assert!(!output.contains(&format!("{lane} -> import-lane")));
    assert_eq!(branch_tip_sha(&helper, lane), branch_tip_after_dev_work);
    assert_eq!(remote_lane_fingerprint(&helper, lane), lane_after_dev_work);
    assert!(file_on_branch(&helper, lane, "comp2/index.js").contains("dev-snapped-on-branch"));
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("dev-snapped-on-branch"));

    // 2. should still export a plain dev commit made on top of that new state, then settle
    let lane_before = remote_lane_fingerprint(&helper, lane);
    let dev_commit_sha = branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp2/index.js",
        &comp2_src("plain-dev-edit-after-snap"),
        "feat: edit comp2 without snapping",
    );
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    assert_ne!(remote_lane_fingerprint(&helper, lane), lane_before);
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("plain-dev-edit-after-snap"));
    assert!(
        helper
            .git(&format!("log origin/{lane} --format=%H"))
            .contains(&dev_commit_sha),
    );
    let tip = branch_tip_sha(&helper, lane);
    let (rerun_out, rerun_code) = sync_run(&helper, lane);
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), tip);

    // 3. should export an unsnapped edit riding along with a .bitmap commit, immediately
    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {lane} origin/{lane}"));
    helper.output_file("comp1/index.js", &comp1_src("snapped-and-exported"));
    helper.run(r#"snap --skip-tests --message "dev snaps comp1""#);
    helper.export("");
    helper.output_file("comp2/index.js", &comp2_src("never-snapped-edit"));
    helper.git("add -A");
    helper.git(r#"commit -m "feat: snap comp1, and edit comp2 without snapping it""#);
    helper.git(&format!("push origin {lane}"));
    helper.git(&format!("checkout -f {default_branch}"));
    git_fetch(&helper);
    let lane_after_dev_work = remote_lane_fingerprint(&helper, lane);

    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch (lane")));
    assert_ne!(remote_lane_fingerprint(&helper, lane), lane_after_dev_work);
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("never-snapped-edit"));
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("snapped-and-exported"));

    // 4. should settle a plain non-component commit with a ledger commit, moving nothing on the lane
    let lane_before = remote_lane_fingerprint(&helper, lane);
    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "docs/note.md",
        "a plain commit\n",
        "docs: an ordinary commit",
    );
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    assert_eq!(remote_lane_fingerprint(&helper, lane), lane_before);
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("never-snapped-edit"));
}

#[test]
fn ci_sync_source_edit_hidden_under_later_bitmap_only_commit_is_dev_work() {
    let helper = Helper::new();
    let lane = "split-bundle";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("split-v1"))],
        "split v1",
        "",
    );
    seed_sync(&helper, lane);

    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {lane} origin/{lane}"));
    helper.output_file("comp2/index.js", &comp2_src("edit-under-the-bitmap-commit"));
    helper.git("add -A");
    helper.git(r#"commit -m "feat: edit comp2""#);
    let mut bitmap_file = fs::OpenOptions::new()
        .append(true)
        .open(helper.scopes.local_path.join(".bitmap"))
        .unwrap();
    bitmap_file.write_all(b"\n").unwrap();
    drop(bitmap_file);
    helper.git("add -A");
    helper.git(r#"commit -m "chore: touch .bitmap""#);
    helper.git(&format!("push origin {lane}"));
    helper.git(&format!("checkout -f {default_branch}"));

    // 1. exports the hidden edit onto the lane instead of declaring convergence
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    let on_lane = lane_tip_file(&dev_path, "comp2/index.js");
    assert!(
        on_lane.contains("edit-under-the-bitmap-commit"),
        "comp2/index.js on the lane tip:\n{on_lane}",
    );

    // 2. a second run converges without pushing anything
    let sha_before = branch_tip_sha(&helper, lane);
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged")));
    assert_eq!(branch_tip_sha(&helper, lane), sha_before);
}

#[test]
fn ci_sync_developer_bitmap_commit_must_not_launder_branch_into_deletion() {
    let helper = Helper::new();
    let lane = "launder";
    let unexported_branch = "never-pushed";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("launder-snap"))],
        "launder lane snap",
        "",
    );
    seed_sync(&helper, lane);

    // 1. should KEEP a branch whose tip is a developer's .bitmap commit when the lane is removed, twice
    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {lane} origin/{lane}"));
    helper.output_file("comp2/index.js", &comp2_src("unexported-local-snap"));
    helper.run(r#"snap --skip-tests --message "dev snaps comp2 but never exports it""#);
    helper.git("add .bitmap");
    helper.git(r#"commit -m "chore: record a local snap that was never exported""#);
    helper.git(&format!("push origin {lane}"));
    helper.git(&format!("checkout -f {default_branch}"));
    git_fetch(&helper);
    let tip_before = branch_tip_sha(&helper, lane);

    let changed = helper.git(&format!("show --stat --format= origin/{lane}"));
    assert!(changed.contains(".bitmap"), "files in the dev commit:\n{changed}");
    assert!(!branch_tip_message(&helper, lane).contains("[bit-sync]"));
    assert!(file_on_branch(&helper, lane, ".bitmap").contains("_bit_lane"));

    helper.native(&format!(
        "lane remove {}/{} --remote --silent --force",
        helper.scopes.remote, lane,
    ));
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> close-pr")));
    assert!(output.contains(&format!(
        "branch {lane} kept: its tip was not written by bit ci sync"
    )));
    assert!(!output.contains("branch carries unmerged commits"));
    assert!(remote_branch_exists(&helper, lane));
    assert_eq!(branch_tip_sha(&helper, lane), tip_before);
    assert!(file_on_branch(&helper, lane, ".bitmap").contains("_bit_lane"));

    let (rerun_out, rerun_code) = sync_run(&helper, "--all");
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("branch {lane} kept")));
    assert!(remote_branch_exists(&helper, lane));
    assert_eq!(branch_tip_sha(&helper, lane), tip_before);

    // 2. should ignore a branch whose .bitmap points at a never-exported lane, not read it as removed
    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {unexported_branch} origin/{default_branch}"));
    helper.native(&format!("lane create {unexported_branch}"));
    helper.output_file("comp1/index.js", &comp1_src("work-on-a-never-pushed-lane"));
    helper.git("add -A");
    helper.git(r#"commit -m "feat: start a lane locally, never export it""#);
    helper.git(&format!("push origin {unexported_branch}"));
    let tip_before = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    helper.native("switch main");
    helper.git(&format!("checkout -f {default_branch}"));
    git_fetch(&helper);

    let bitmap = file_on_branch(&helper, unexported_branch, ".bitmap");
    assert!(bitmap.contains("_bit_lane"));
    assert!(bitmap.contains(unexported_branch));
    assert!(
        bitmap
            .chars()
            .filter(|ch| !ch.is_whitespace())
            .collect::<String>()
            .contains(r#""exported":false"#),
    );

    let (output, exit_code) = sync_run(&helper, "--all");
    assert_eq!(exit_code, 0, "bit ci sync --all output:\n{output}");
    assert!(output.contains(&format!("{unexported_branch} -> noop")));
    assert!(!output.contains(&format!("{unexported_branch} -> close-pr")));
    assert!(remote_branch_exists(&helper, unexported_branch));
    assert_eq!(branch_tip_sha(&helper, unexported_branch), tip_before);
    assert!(
        file_on_branch(&helper, unexported_branch, "comp1/index.js")
            .contains("work-on-a-never-pushed-lane"),
    );
}

#[test]
fn ci_sync_cold_runner_reconciles_diverged_pair() {
    let helper = Helper::new();
    let lane = "cold-start";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("cold-lane-snap-1"))],
        "cold lane snap 1",
        "",
    );
    seed_sync(&helper, lane);

    // 1. should merge both sides on a scope that had never seen the lane, then converge warm
    lane_side_edit(&dev_path, "comp1/index.js", &comp1_src("cold-lane-snap-2"), "cold lane snap 2");
    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp2/index.js",
        &comp2_src("cold-branch-dev"),
        "feat: dev edits comp2",
    );
    make_local_scope_cold(&helper);
    let objects_when_cold = scope_object_count(&helper);
    let bitmap_on_branch = file_on_branch(&helper, lane, ".bitmap");

    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(objects_when_cold, 0);
    assert!(bitmap_on_branch.contains(lane));
    assert!(bitmap_on_branch.contains("_bit_lane"));
    assert!(scope_object_count(&helper) > 0);

    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> merge-diverged")));
    assert!(!output.contains("HALTED"));
    assert!(!output.contains(r#"the branch's .bitmap points at "main""#));
    assert!(output.contains("with no conflicts"));
    assert!(file_on_branch(&helper, lane, "comp1/index.js").contains("cold-lane-snap-2"));
    assert!(file_on_branch(&helper, lane, "comp2/index.js").contains("cold-branch-dev"));
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("cold-lane-snap-2"));
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("cold-branch-dev"));

    let tip = branch_tip_sha(&helper, lane);
    let (rerun_out, rerun_code) = sync_run(&helper, lane);
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), tip);

    // 2. should bring the lane onto the existing branch, also cold, instead of halting
    lane_side_edit(&dev_path, "comp1/index.js", &comp1_src("cold-lane-snap-3"), "cold lane snap 3");
    make_local_scope_cold(&helper);
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> merge-diverged")));
    assert!(output.contains("nothing new to export"));
    assert!(!output.contains("HALTED"));
    assert!(!output.contains("reported success but the workspace is on"));
    assert!(file_on_branch(&helper, lane, "comp1/index.js").contains("cold-lane-snap-3"));

    // 3. should export the branch, also cold, instead of halting on a phantom failed switch
    let dev_commit_sha = branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp2/index.js",
        &comp2_src("cold-branch-dev-2"),
        "feat: comp2 again",
    );
    let tip_before_sync = branch_tip_sha(&helper, lane);
    make_local_scope_cold(&helper);
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    assert!(!output.contains("HALTED"));
    assert!(!output.contains("Refusing destructive recovery"));
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("cold-branch-dev-2"));
    assert_ne!(branch_tip_sha(&helper, lane), tip_before_sync);
    assert!(branch_tip_message(&helper, lane).contains("[bit-sync]"));
    assert!(
        helper
            .git(&format!("log origin/{lane} --format=%H"))
            .contains(&dev_commit_sha),
    );
}

#[test]
fn ci_sync_single_branch_clone_reconciles_untracked_lane_branch() {
    let helper = Helper::new();
    let lane = "narrow-clone";

    let (default_branch, bare_repo_path) =
        setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("narrow-snap-1"))],
        "narrow snap 1",
        "",
    );
    seed_sync(&helper, lane);
    lane_side_edit(&dev_path, "comp1/index.js", &comp1_src("narrow-snap-2"), "narrow snap 2");

    let clone_path = helper.scopes.e2e_dir.join("narrow-clone-repo");
    Helper::git_in(
        &helper.scopes.e2e_dir,
        &format!(
            "clone --single-branch --branch {default_branch} {} {}",
            bare_repo_path.display(),
            clone_path.display(),
        ),
    );
    let modules = helper.scopes.local_path.join("node_modules");
    if modules.exists() {
        setup::copy_dir(&modules, &clone_path.join("node_modules"));
    }
    assert!(Helper::cmd_in(&clone_path, "init").status.success());
    Helper::add_remote_to(&helper.scopes.remote_path, &clone_path.join(".bit"));

    let configured_refspec =
        Helper::git_in(&clone_path, "config --get-all remote.origin.fetch").trim().to_owned();
    let remote_tracking_before = Helper::git_in(&clone_path, "branch -r");
    let lane_visible =
        Helper::git_in(&clone_path, &format!("ls-remote --heads origin {lane}")).trim().to_owned();
    assert_eq!(
        configured_refspec,
        format!("+refs/heads/{default_branch}:refs/remotes/origin/{default_branch}"),
    );
    assert!(!remote_tracking_before.contains(lane));
    assert!(!lane_visible.is_empty());

    let (output, exit_code) = run_bit_in(&clone_path, &format!("ci sync {lane}"));
    git_fetch(&helper);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} ->")));
    assert!(!output.contains("HALTED"));
    assert!(!output.to_lowercase().contains("unknown revision"));
    assert!(!output.to_lowercase().contains("ambiguous argument"));
    let remote_branches = Helper::git_in(&clone_path, "branch -r");
    assert!(remote_branches.contains(lane));
    assert!(file_on_branch(&helper, lane, "comp1/index.js").contains("narrow-snap-2"));
}

#[test]
fn ci_sync_untracked_files_in_workspace_discarded_rather_than_pushed() {
    let helper = Helper::new();
    let lane = "no-contamination";
    let junk_file = "leftover-note.txt";
    let junk_dir_file = "leftover-residue/from-a-previous-lane.js";
    let branch = lane;

    setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("contamination-guard"))],
        "contamination guard",
        "",
    );

    helper.output_file(junk_file, "not part of any lane state\n");
    helper.output_file(junk_dir_file, "export const stale = true;\n");

    let (output, exit_code) = sync_run(&helper, lane);
    assert!(output.contains("uncommitted change"));
    assert!(output.contains(junk_file));
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} ->")));
    assert!(!output.contains("HALTED"));
    assert!(file_on_branch(&helper, branch, "comp1/index.js").contains("contamination-guard"));

    assert!(branch_paths_matching(&helper, branch, "leftover-note").is_empty());
    assert!(branch_paths_matching(&helper, branch, "leftover-residue").is_empty());
    assert!(!helper.scopes.local_path.join(junk_file).exists());
    assert!(!helper.scopes.local_path.join(junk_dir_file).exists());
    assert!(helper.scopes.local_path.join(".bit").is_dir());
}
