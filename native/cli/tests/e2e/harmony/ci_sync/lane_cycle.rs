//! E2E tests for `bit ci sync: the lane/branch reconcile cycle`.
//!
//! Ported from:
//! - `e2e/harmony/ci-sync-lane-cycle.e2e.ts`

use super::support::{
    NO_GIT_HOST_WARNING, branch_paths_matching, branch_side_commit, branch_tip_message,
    branch_tip_sha, comp1_src, comp2_src, create_lane_with_snap, file_on_branch, git_fetch,
    lane_head_trailer, lane_side_edit, lane_tip_file, remote_branch_exists,
    remote_lane_fingerprint, seed_sync, setup_sync_workspace, sync_run,
};
use crate::helper::{Helper, parse};
use serde_json::json;
use std::fs;

#[test]
fn ci_sync_lane_branch_reconcile_cycle() {
    let helper = Helper::new();
    let lane = "sync-cycle";
    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("lane-snap-1"))],
        "lane snap 1",
        "",
    );

    // A: a remote lane with no branch is imported onto a new branch, PR-less, content and pointer committed
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> import-lane")));
    assert!(output.contains(NO_GIT_HOST_WARNING));
    assert!(output.contains(&format!("skipping PR creation for {lane}")));
    assert!(remote_branch_exists(&helper, lane));
    let message = branch_tip_message(&helper, lane);
    assert!(message.contains("[bit-sync]"));
    assert!(message.contains("Bit-Lane-Head:"));
    let trailer = lane_head_trailer(&helper, lane).expect("lane head trailer");
    assert_eq!(trailer.len(), 40);
    let on_branch = file_on_branch(&helper, lane, "comp1/index.js");
    assert!(on_branch.contains("lane-snap-1"), "comp1/index.js on origin/{lane}:\n{on_branch}");
    assert!(!on_branch.contains("comp1: initial"));
    assert!(file_on_branch(&helper, &default_branch, "comp1/index.js").contains("comp1: initial"));
    assert!(file_on_branch(&helper, lane, ".bitmap").contains(lane));
    assert_eq!(helper.git("branch --show-current").trim(), default_branch);
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("main"));

    // B: re-running with nothing moved is a converged no-op that pushes nothing
    let sha_before = branch_tip_sha(&helper, lane);
    let lane_before = remote_lane_fingerprint(&helper, lane);
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), sha_before);
    assert_eq!(remote_lane_fingerprint(&helper, lane), lane_before);

    // C: a dev commit on the branch is snapped onto the lane under a fresh trailer, then converges
    let lane_before = remote_lane_fingerprint(&helper, lane);
    let trailer_before = lane_head_trailer(&helper, lane);
    let dev_commit_sha = branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp2/index.js",
        &comp2_src("branch-dev-1"),
        "feat: dev edits comp2 on the branch",
    );
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    assert_ne!(remote_lane_fingerprint(&helper, lane), lane_before);
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("branch-dev-1"));
    let tip = branch_tip_sha(&helper, lane);
    assert_ne!(tip, dev_commit_sha);
    assert!(branch_tip_message(&helper, lane).contains("[bit-sync]"));
    assert_ne!(lane_head_trailer(&helper, lane), trailer_before);
    assert!(
        helper
            .git(&format!("log origin/{lane} --format=%H"))
            .contains(&dev_commit_sha),
    );
    let (rerun_out, rerun_code) = sync_run(&helper, lane);
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), tip);

    // D1: both sides moved on DIFFERENT files -> merged into the branch before snapping, then converges
    let trailer_before = lane_head_trailer(&helper, lane);
    lane_side_edit(&dev_path, "comp1/index.js", &comp1_src("lane-snap-2"), "lane snap 2");
    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp2/index.js",
        &comp2_src("branch-dev-2"),
        "feat: dev edits comp2 again on the branch",
    );
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> merge-diverged")));
    assert!(output.contains("Merging lane"));
    assert!(output.contains("with no conflicts"));
    assert!(file_on_branch(&helper, lane, "comp1/index.js").contains("lane-snap-2"));
    assert!(file_on_branch(&helper, lane, "comp2/index.js").contains("branch-dev-2"));
    let lane_comp1 = lane_tip_file(&dev_path, "comp1/index.js");
    assert!(lane_comp1.contains("lane-snap-2"), "comp1/index.js at the lane tip:\n{lane_comp1}");
    assert!(!lane_comp1.contains("lane-snap-1;"));
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("branch-dev-2"));
    assert!(branch_tip_message(&helper, lane).contains("[bit-sync]"));
    assert_ne!(lane_head_trailer(&helper, lane), trailer_before);
    let tip = branch_tip_sha(&helper, lane);
    let (rerun_out, rerun_code) = sync_run(&helper, lane);
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), tip);

    // D2: both sides edited the SAME line -> halts non-zero, naming the component, writing to neither side
    lane_side_edit(
        &dev_path,
        "comp1/index.js",
        &comp1_src("lane-conflict"),
        "lane conflicting snap",
    );
    let dev_commit_sha = branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp1/index.js",
        &comp1_src("branch-conflict"),
        "feat: dev edits the same comp1 line on the branch",
    );
    let lane_before = remote_lane_fingerprint(&helper, lane);
    let (output, exit_code) = sync_run(&helper, lane);
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("Cannot sync lane"));
    assert!(output.contains("merge conflicts in"));
    assert!(output.contains("comp1"));
    assert!(output.contains("bit ci sync could not reconcile 1 target(s)"));
    assert!(output.contains("HALTED"));
    assert!(output.contains(&format!("skipping conflict label/comment for {lane}")));
    assert_eq!(branch_tip_sha(&helper, lane), dev_commit_sha);
    assert!(!branch_tip_message(&helper, lane).contains("[bit-sync]"));
    assert_eq!(remote_lane_fingerprint(&helper, lane), lane_before);
    let on_branch = file_on_branch(&helper, lane, "comp1/index.js");
    assert!(on_branch.contains("branch-conflict"));
    assert!(!on_branch.contains("<<<<<<<"));
    assert_eq!(helper.git("branch --show-current").trim(), default_branch);
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("main"));

    // a lane removed remotely while its branch holds unexported work: close-pr keeps the branch, twice
    let tip_before = branch_tip_sha(&helper, lane);
    helper.native(&format!(
        "lane remove {}/{} --remote --silent --force",
        helper.scopes.remote, lane,
    ));
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> close-pr")));
    assert!(output.contains(&format!("skipping PR close for {lane}")));
    assert!(output.contains(
        "lane removed remotely but branch carries unmerged commits; keeping branch"
    ));
    assert!(output.contains(&format!("branch {lane} kept")));
    assert!(remote_branch_exists(&helper, lane), "origin/{lane} must survive");
    assert_eq!(branch_tip_sha(&helper, lane), tip_before);
    assert!(file_on_branch(&helper, lane, "comp1/index.js").contains("branch-conflict"));
    let (rerun_out, rerun_code) = sync_run(&helper, lane);
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("branch {lane} kept")));
    assert!(remote_branch_exists(&helper, lane));
    assert_eq!(branch_tip_sha(&helper, lane), tip_before);
}

#[test]
fn ci_sync_all_across_two_lanes() {
    let helper = Helper::new();
    let lane_a = "sync-a";
    let lane_b = "sync-b";
    let plain_branch = "feature-x";
    let comp3_src = |marker: &str| format!("module.exports = () => 'comp3: {marker}';\n");

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));

    helper.git(&format!("checkout -b {plain_branch}"));
    helper.output_file("docs/notes.md", "unmerged developer work that must not be destroyed\n");
    helper.git("add -A");
    helper.git(r#"commit -m "docs: unmerged developer work""#);
    helper.git(&format!("push origin {plain_branch}"));
    let plain_branch_sha = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    helper.git(&format!("checkout -f {default_branch}"));

    let dev_a = helper.clone_workspace();
    assert!(Helper::cmd_in(&dev_a, &format!("lane create {lane_a}")).status.success());
    fs::write(dev_a.join("comp1/index.js"), comp1_src("lane-a-snap-1")).unwrap();
    fs::create_dir_all(dev_a.join("comp3")).unwrap();
    fs::write(dev_a.join("comp3/index.js"), comp3_src("lane-a-only")).unwrap();
    assert!(Helper::cmd_in(&dev_a, "add comp3").status.success());
    assert!(
        Helper::cmd_in(&dev_a, r#"snap --skip-tests --message "lane a snap 1""#)
            .status
            .success(),
    );
    assert!(Helper::cmd_in(&dev_a, "export").status.success());

    let dev_b = create_lane_with_snap(
        &helper,
        lane_b,
        &[("comp2/index.js", &comp2_src("lane-b-snap-1"))],
        "lane b snap 1",
        "",
    );

    // 1. should import both lanes onto their own branches, leaving an ordinary developer branch alone
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane_a} -> import-lane")));
    assert!(output.contains(&format!("{lane_b} -> import-lane")));
    assert!(file_on_branch(&helper, lane_a, "comp1/index.js").contains("lane-a-snap-1"));
    assert!(file_on_branch(&helper, lane_b, "comp2/index.js").contains("lane-b-snap-1"));
    assert!(
        output.contains(&format!(
            "{plain_branch} -> noop (branch maps to no lane and has no sync history"
        )),
        "bit ci sync output:\n{output}",
    );
    assert!(remote_branch_exists(&helper, plain_branch));
    assert_eq!(branch_tip_sha(&helper, plain_branch), plain_branch_sha);
    assert!(
        file_on_branch(&helper, plain_branch, "docs/notes.md").contains("must not be destroyed"),
    );
    let on_a = branch_paths_matching(&helper, lane_a, "comp3");
    assert!(!on_a.is_empty());
    let comp3_idx = on_a
        .iter()
        .find(|p| p.ends_with("index.js"))
        .unwrap();
    assert!(file_on_branch(&helper, lane_a, comp3_idx).contains("lane-a-only"));
    assert!(branch_paths_matching(&helper, lane_b, "comp3").is_empty());
    assert_eq!(helper.git("branch --show-current").trim(), default_branch);
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("main"));

    // 2. should halt the conflicting lane, leave it untouched, and still reconcile the lane after it
    lane_side_edit(
        &dev_a,
        "comp1/index.js",
        &comp1_src("lane-a-conflict"),
        "lane a conflicting snap",
    );
    let dev_commit_sha_a = branch_side_commit(
        &helper,
        lane_a,
        &default_branch,
        "comp1/index.js",
        &comp1_src("branch-a-conflict"),
        "feat: dev edits the same comp1 line on lane A branch",
    );
    lane_side_edit(&dev_b, "comp2/index.js", &comp2_src("lane-b-snap-2"), "lane b snap 2");
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("HALTED"));
    assert!(output.contains("merge conflicts in"));
    assert!(output.contains("bit ci sync could not reconcile 1 target(s)"));
    assert_eq!(branch_tip_sha(&helper, lane_a), dev_commit_sha_a);
    assert!(!branch_tip_message(&helper, lane_a).contains("[bit-sync]"));
    assert!(output.contains(&format!("{lane_b} -> merge-diverged")));
    assert!(file_on_branch(&helper, lane_b, "comp2/index.js").contains("lane-b-snap-2"));
    assert_eq!(lane_head_trailer(&helper, lane_b).unwrap().len(), 40);
    assert!(branch_paths_matching(&helper, lane_b, "comp3").is_empty());
    assert!(!file_on_branch(&helper, lane_b, "comp1/index.js").contains("lane-a-conflict"));

    // 3. should retire a lane deleted on bit.cloud, keep the rest of the run, and drop it from the next run
    branch_side_commit(
        &helper,
        lane_a,
        &default_branch,
        "comp1/index.js",
        &comp1_src("lane-a-snap-1"),
        "revert comp1 to the last synced content",
    );
    branch_side_commit(
        &helper,
        lane_a,
        &default_branch,
        "comp2/index.js",
        &comp2_src("branch-a-export"),
        "feat: dev edits comp2 on lane A branch",
    );
    seed_sync(&helper, lane_a);
    assert!(branch_tip_message(&helper, lane_a).contains("[bit-sync]"));

    helper.native(&format!(
        "lane remove {}/{} --remote --silent --force",
        helper.scopes.remote, lane_a,
    ));
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("Reconciling 3 mapped lane(s)"), "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane_a} -> close-pr")));
    assert!(output.contains(&format!("branch {lane_a} deleted")));
    assert!(!remote_branch_exists(&helper, lane_a));
    assert!(output.contains(&format!("skipping PR close for {lane_a}")));
    assert!(output.contains(&format!("{lane_b} -> noop (converged)")));
    assert!(remote_branch_exists(&helper, lane_b));
    assert!(file_on_branch(&helper, lane_b, "comp2/index.js").contains("lane-b-snap-2"));
    assert!(remote_branch_exists(&helper, plain_branch));
    assert_eq!(branch_tip_sha(&helper, plain_branch), plain_branch_sha);

    let (rerun_out, rerun_code) = sync_run(&helper, "--all");
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains("Reconciling 2 mapped lane(s)"));
    assert!(!rerun_out.contains(&format!("{lane_a} ->")));
    assert!(rerun_out.contains(&format!("{lane_b} -> noop (converged)")));

    // 4. should read the branch's OWN sync commit when a Bit-Lane-Head commit is merged in from elsewhere
    git_fetch(&helper);
    helper.git(&format!("checkout -f -B decoy-src origin/{default_branch}"));
    helper.output_file("comp1/index.js", &comp1_src("post-merge-dev"));
    helper.git("add -A");
    helper.git(&format!(
        r#"commit -m "chore(bit-sync): decoy from another pair" -m "Bit-Lane-Head: {}" -m "[bit-sync]""#,
        "f".repeat(40),
    ));
    helper.git(&format!("checkout -f -B {lane_b} origin/{lane_b}"));
    helper.git("merge --no-ff --no-edit decoy-src");
    helper.git(&format!("push origin {lane_b}"));
    helper.git(&format!("checkout -f {default_branch}"));

    let (output, exit_code) = sync_run(&helper, "--all");
    assert!(
        output.contains(&format!("{lane_b} -> export-branch")),
        "bit ci sync output:\n{output}",
    );
    assert!(!output.contains(&format!("{lane_b} -> merge-diverged")));
    assert!(!output.contains(&format!("{lane_b} -> import-lane")));
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert_ne!(lane_head_trailer(&helper, lane_b).as_deref(), Some(&*"f".repeat(40)));
    let (rerun_out, rerun_code) = sync_run(&helper, "--all");
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{lane_b} -> noop (converged)")));
}
