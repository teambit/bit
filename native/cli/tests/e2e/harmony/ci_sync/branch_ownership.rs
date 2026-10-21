//! E2E tests for `bit ci sync: branch ownership and first contact`.
//!
//! Ported from:
//! - `e2e/harmony/ci-sync-branch-ownership.e2e.ts`

use super::support::{
    arm_pre_push_hook, branch_side_commit, branch_tip_sha, comp1_src, comp2_src,
    create_lane_with_snap, disarm_pre_push_hook, file_on_branch, git_fetch, lane_tip_file,
    remote_branch_exists, remote_lane_fingerprint, scope_object_count, seed_sync,
    setup_sync_workspace, sync_run,
};
use crate::helper::Helper;
use serde_json::json;

#[test]
fn ci_sync_branch_ownership_decides_what_close_pr_may_delete() {
    let helper = Helper::new();
    let lane = "own-lane";
    let plain_branch = "feature-x";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("own-lane-snap"))],
        "own lane snap",
        "",
    );
    seed_sync(&helper, lane);

    helper.git(&format!("checkout -f -B {default_branch} origin/{default_branch}"));
    helper.git(&format!(
        r#"commit --allow-empty -m "chore(bit-sync): sync lane {}/other-lane @ abc123def" -m "Bit-Lane-Head: {}" -m "[bit-sync]""#,
        helper.scopes.remote,
        "a".repeat(40),
    ));
    helper.git(&format!("push origin {default_branch}"));

    helper.git(&format!("checkout -b {plain_branch}"));
    helper.output_file("docs/plan.md", "unmerged developer work that must not be destroyed\n");
    helper.git("add -A");
    helper.git(r#"commit -m "docs: unmerged developer work""#);
    helper.git(&format!("push origin {plain_branch}"));
    let plain_branch_sha = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    helper.git(&format!("checkout -f {default_branch}"));
    git_fetch(&helper);

    let merge_lane_branch_into_default = |helper: &Helper| {
        git_fetch(helper);
        helper.git(&format!("checkout -f -B {default_branch} origin/{default_branch}"));
        helper.git(&format!("merge -s ours --no-edit origin/{lane}"));
        helper.git(&format!("push origin {default_branch}"));
        git_fetch(helper);
    };

    // 1. should ignore a branch that INHERITED a sync trailer, on the structural evidence, twice over
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!(
        "{plain_branch} -> noop (branch maps to no lane and has no sync history"
    )));
    assert!(remote_branch_exists(&helper, plain_branch));
    assert_eq!(branch_tip_sha(&helper, plain_branch), plain_branch_sha);
    assert!(
        file_on_branch(&helper, plain_branch, "docs/plan.md").contains("must not be destroyed"),
    );
    let log = helper.git(&format!("log origin/{plain_branch} --first-parent --format=%B"));
    assert!(log.contains("Bit-Lane-Head:"));
    assert!(log.contains(&format!("sync lane {}/other-lane", helper.scopes.remote)));
    assert!(!file_on_branch(&helper, plain_branch, ".bitmap").contains("_bit_lane"));
    let (rerun_out, rerun_code) = sync_run(&helper, "--all");
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{plain_branch} -> noop")));
    assert!(remote_branch_exists(&helper, plain_branch));
    assert_eq!(branch_tip_sha(&helper, plain_branch), plain_branch_sha);

    // 2. own-superseded (sync history merged, tip is not): should close the PR but keep the branch, unmoved
    merge_lane_branch_into_default(&helper);
    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp2/index.js",
        &comp2_src("after-the-merge"),
        "feat: more work",
    );
    git_fetch(&helper);
    let tip_before = branch_tip_sha(&helper, lane);
    helper.native(&format!(
        "lane remove {}/{} --remote --silent --force",
        helper.scopes.remote, lane,
    ));
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(
        "lane removed remotely but branch carries unmerged commits; keeping branch"
    ));
    assert!(output.contains(&format!("branch {lane} kept")));
    assert!(remote_branch_exists(&helper, lane));
    assert_eq!(branch_tip_sha(&helper, lane), tip_before);
    assert!(file_on_branch(&helper, lane, "comp2/index.js").contains("after-the-merge"));

    // 3. own-merged (fully merged into the default branch): should close the PR and delete the branch
    merge_lane_branch_into_default(&helper);
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> close-pr")));
    assert!(output.contains(&format!("branch {lane} deleted")));
    assert!(!remote_branch_exists(&helper, lane));
    assert!(remote_branch_exists(&helper, plain_branch));
    assert_eq!(branch_tip_sha(&helper, plain_branch), plain_branch_sha);
}

#[test]
fn ci_sync_branch_advancing_between_ownership_read_and_delete_is_kept() {
    let helper = Helper::new();
    let lane = "race-lane";

    let (default_branch, bare_repo_path) =
        setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("race-lane-snap"))],
        "race lane snap",
        "",
    );
    seed_sync(&helper, lane);
    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {default_branch} origin/{default_branch}"));
    helper.git(&format!("merge -s ours --no-edit origin/{lane}"));
    helper.git(&format!("push origin {default_branch}"));
    git_fetch(&helper);
    helper.native(&format!(
        "lane remove {}/{} --remote --silent --force",
        helper.scopes.remote, lane,
    ));

    let raced_to = branch_tip_sha(&helper, &default_branch);
    let hook_path = arm_pre_push_hook(
        &helper,
        &format!(
            "git --git-dir='{}' update-ref refs/heads/{lane} {raced_to}",
            bare_repo_path.display(),
        ),
    );
    let (output, exit_code) = sync_run(&helper, "--all");
    disarm_pre_push_hook(&helper, &hook_path);

    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> close-pr")));
    assert!(output.contains(&format!("branch {lane} kept")));
    assert!(output.contains("its tip advanced after the ownership evidence was read"));
    assert!(!output.contains(&format!("branch {lane} deleted")));
    assert!(remote_branch_exists(&helper, lane));
    assert_eq!(branch_tip_sha(&helper, lane), raced_to);
}

#[test]
fn ci_sync_branch_adopted_into_existing_lane_on_first_contact() {
    let helper = Helper::new();
    let feature_branch = "adopt-feature";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    helper.git(&format!("checkout -b {feature_branch}"));
    helper.output_file("comp1/index.js", &comp1_src("adopt-feature-v1"));
    helper.git("add .");
    helper.git(r#"commit -m "feat: adopt-feature work""#);
    helper.git(&format!("push -u origin {feature_branch}"));

    helper.run(r#"ci pr --keep-lane --message "adopt via keep-lane""#);
    helper.git(&format!("checkout -f {default_branch}"));
    let dev_path = helper.clone_workspace();
    assert!(
        Helper::cmd_in(
            &dev_path,
            &format!("switch {}/{} --get-all", helper.scopes.remote, feature_branch)
        )
        .status
        .success(),
    );

    // 1. starts with no lane pointer at all on the branch
    assert!(!file_on_branch(&helper, feature_branch, ".bitmap").contains(r#""_bit_lane""#));

    // 2. adopts the branch instead of halting, and writes the lane pointer to it
    let (output, exit_code) = sync_run(&helper, feature_branch);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{feature_branch} -> adopt-branch")));
    assert!(!output.contains("HALTED"));
    let bitmap_at_tip = file_on_branch(&helper, feature_branch, ".bitmap");
    assert!(bitmap_at_tip.contains(r#""_bit_lane""#));
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("adopt-feature-v1"));

    // 3. a second run sees the pair as converged and does nothing further
    let (output, exit_code) = sync_run(&helper, feature_branch);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{feature_branch} -> noop (converged)")));
}

#[test]
fn ci_sync_branch_whose_content_would_change_lane_at_first_contact_halts() {
    let helper = Helper::new();
    let feature_branch = "adopt-conflict";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    helper.git(&format!("checkout -b {feature_branch}"));
    helper.output_file("comp1/index.js", &comp1_src("adopt-conflict-v1"));
    helper.git("add .");
    helper.git(r#"commit -m "feat: adopt-conflict work""#);
    helper.git(&format!("push -u origin {feature_branch}"));

    helper.run(r#"ci pr --keep-lane --message "adopt via keep-lane""#);

    helper.output_file("comp1/index.js", &comp1_src("adopt-conflict-v2"));
    helper.git("add .");
    helper.git(r#"commit -m "feat: adopt-conflict v2, never re-synced""#);
    helper.git(&format!("push origin {feature_branch}"));
    helper.git(&format!("checkout -f {default_branch}"));

    let dev_path = helper.clone_workspace();
    assert!(
        Helper::cmd_in(
            &dev_path,
            &format!("switch {}/{} --get-all", helper.scopes.remote, feature_branch)
        )
        .status
        .success(),
    );
    let lane_fingerprint_before_run = remote_lane_fingerprint(&helper, feature_branch);

    // 1. halts instead of adopting, and leaves the lane content untouched
    let (output, exit_code) = sync_run(&helper, feature_branch);
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("HALTED"));
    assert!(output.contains("cannot tell which side is newer"));
    assert!(output.contains("adopting would change"));
    assert_eq!(remote_lane_fingerprint(&helper, feature_branch), lane_fingerprint_before_run);
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("adopt-conflict-v1"));

    // 2. leaves the local scope byte-clean — a repeat halt attempt creates no additional objects
    let after_first_halt = scope_object_count(&helper);
    let (output, exit_code) = sync_run(&helper, feature_branch);
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("HALTED"));
    assert_eq!(scope_object_count(&helper), after_first_halt);
}

#[test]
fn ci_sync_one_lane_halting_during_adoption_does_not_affect_healthy_lane() {
    let helper = Helper::new();
    let halting_lane = "adopt-conflict-blast";
    let healthy_lane = "healthy-blast";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));

    helper.git(&format!("checkout -b {halting_lane}"));
    helper.output_file("comp1/index.js", &comp1_src("blast-v1"));
    helper.git("add .");
    helper.git(r#"commit -m "feat: blast work""#);
    helper.git(&format!("push -u origin {halting_lane}"));
    helper.run(r#"ci pr --keep-lane --message "adopt via keep-lane""#);
    helper.output_file("comp1/index.js", &comp1_src("blast-v2"));
    helper.git("add .");
    helper.git(r#"commit -m "feat: blast v2, never re-synced""#);
    helper.git(&format!("push origin {halting_lane}"));
    helper.git(&format!("checkout -f {default_branch}"));

    create_lane_with_snap(
        &helper,
        healthy_lane,
        &[("comp2/index.js", &comp2_src("healthy-v1"))],
        "healthy v1",
        "",
    );

    // 1. the healthy lane converges and the halting one is left untouched, in the same run
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("HALTED {halting_lane}")));
    assert!(output.contains("adopting would change"));
    assert!(output.contains(&format!("{healthy_lane} -> import-lane")));
    assert!(file_on_branch(&helper, healthy_lane, "comp2/index.js").contains("healthy-v1"));

    // 2. a follow-up targeted run confirms the healthy lane converged cleanly
    let (rerun_out, rerun_code) = sync_run(&helper, healthy_lane);
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{healthy_lane} -> noop (converged)")));
}
