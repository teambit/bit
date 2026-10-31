//! E2E tests for `bit ci sync: what counts as work, and what converges`.
//!
//! Ported from:
//! - `e2e/harmony/ci-sync-convergence.e2e.ts`

use super::support::{
    arm_pre_push_hook, branch_side_commit, branch_tip_message, branch_tip_sha, comp1_src,
    comp2_src, create_lane_with_snap, disarm_pre_push_hook, file_on_branch, git_fetch,
    lane_side_edit, lane_tip_file, remote_branch_exists, remote_lane_fingerprint, seed_sync,
    set_sync_config, setup_sync_workspace, sync_run,
};
use crate::helper::{Helper, parse};
use serde_json::json;
use std::{fs, io::Write};

#[test]
fn ci_sync_rejected_sync_commit_push_reports_benign_race() {
    let helper = Helper::new();
    let lane = "import-race-lane";

    setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("import-race-v1"))],
        "v1",
        "",
    );
    seed_sync(&helper, lane);
    lane_side_edit(&dev_path, "comp1/index.js", &comp1_src("import-race-v2"), "v2");
    let winner_path = helper.clone_workspace();

    let bit_bin = env!("CARGO_BIN_EXE_bit");
    let hook_path = arm_pre_push_hook(
        &helper,
        &format!(
            "unset GITHUB_TOKEN BIT_GITHUB_TOKEN GITHUB_REPOSITORY GITHUB_HEAD_REF && cd '{}' && '{}' ci sync {lane}",
            winner_path.display(),
            bit_bin,
        ),
    );
    let (output, exit_code) = sync_run(&helper, lane);
    disarm_pre_push_hook(&helper, &hook_path);

    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!(
        "{lane} -> raced (lane updated; branch ledger commit lost the push race — next run re-plans)"
    )));
    assert!(!output.contains("HALTED"));
    assert!(!output.contains("bit-sync-conflict"));
    let winner_own_pushed_sha =
        Helper::git_in(&winner_path, &format!("rev-parse origin/{lane}")).trim().to_owned();
    let winner_tip = branch_tip_sha(&helper, lane);
    assert_eq!(winner_tip, winner_own_pushed_sha);

    let (rerun_out, rerun_code) = sync_run(&helper, lane);
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), winner_tip);

    lane_side_edit(&dev_path, "comp1/index.js", &comp1_src("import-race-v3"), "v3");
    let (reuse_out, reuse_code) = sync_run(&helper, lane);
    assert_eq!(reuse_code, 0, "bit ci sync output:\n{reuse_out}");
    assert!(reuse_out.contains(&format!("{lane} -> merge-diverged")));
    assert!(!reuse_out.contains("HALTED"));
}

#[test]
fn ci_sync_commit_bundling_source_edit_with_bitmap_write_is_dev_work() {
    let helper = Helper::new();
    let lane = "bundled-commit";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("bundled-v1"))],
        "bundled v1",
        "",
    );
    let (seed_out, seed_code) = sync_run(&helper, lane);
    assert_eq!(seed_code, 0, "bit ci sync output:\n{seed_out}");
    assert!(seed_out.contains(&format!("{lane} -> import-lane")));

    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {lane} origin/{lane}"));
    helper.output_file("comp1/index.js", &comp1_src("bundled-by-hand"));
    let mut bitmap_file = fs::OpenOptions::new()
        .append(true)
        .open(helper.scopes.local_path.join(".bitmap"))
        .unwrap();
    bitmap_file.write_all(b"\n").unwrap();
    drop(bitmap_file);
    helper.git("add -A");
    helper.git(r#"commit -m "fix: hand-resolved content riding with a .bitmap write""#);
    helper.git(&format!("push origin {lane}"));
    helper.git(&format!("checkout -f {default_branch}"));

    // 1. exports the bundled edit onto the lane instead of declaring convergence
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    assert!(!output.contains("noop (converged)"));
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("bundled-by-hand"));

    // 2. a second run reads the truly converged pair as converged
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged)")));
}

#[test]
fn ci_sync_probe_finding_nothing_pending_settles_without_writing() {
    let helper = Helper::new();
    let lane = "clean-probe";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("clean-probe-v1"))],
        "clean probe v1",
        "",
    );
    seed_sync(&helper, lane);

    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {lane} origin/{lane}"));
    helper.output_file("docs/notes.md", "a note no component tracks\n");
    let mut bitmap_file = fs::OpenOptions::new()
        .append(true)
        .open(helper.scopes.local_path.join(".bitmap"))
        .unwrap();
    bitmap_file.write_all(b"\n").unwrap();
    drop(bitmap_file);
    helper.git("add -A");
    helper.git(r#"commit -m "docs: a note riding with a .bitmap write""#);
    helper.git(&format!("push origin {lane}"));
    helper.git(&format!("checkout -f {default_branch}"));
    let dev_tip_sha = branch_tip_sha(&helper, lane);

    // 1. exports nothing and pushes nothing — the developer commit stays the tip
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), dev_tip_sha);

    // 2. the repeat probe is just as write-free
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), dev_tip_sha);
}

#[test]
fn ci_sync_squash_commit_quoting_sync_marker_is_dev_work() {
    let helper = Helper::new();
    let lane = "squash-marker";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("squash-v1"))],
        "squash v1",
        "",
    );
    let (seed_out, seed_code) = sync_run(&helper, lane);
    assert_eq!(seed_code, 0, "bit ci sync output:\n{seed_out}");
    assert!(seed_out.contains(&format!("{lane} -> import-lane")));

    git_fetch(&helper);
    helper.git(&format!("checkout -f -B {lane} origin/{lane}"));
    helper.output_file("comp1/index.js", &comp1_src("squash-era-work"));
    let merge_base = helper
        .git(&format!("merge-base origin/{default_branch} HEAD"))
        .trim()
        .to_owned();
    helper.git(&format!("reset --soft {merge_base}"));
    let message_path = helper.scopes.e2e_dir.join(format!("{lane}-squash-msg.txt"));
    fs::write(
        &message_path,
        [
            "feat: the squash-era work (#42)",
            "",
            "* fix: work on comp1",
            "",
            &format!("* chore(bit-sync): sync lane org.scope/{lane} @ 123abc456"),
            "",
            "Bit-Lane-Head: 4e1243bd22c66e76c2ba9eddc1f91394e57f9f83",
            "[bit-sync]",
            "",
        ]
        .join("\n"),
    )
    .unwrap();
    helper.git("add -A");
    helper.git(&format!(r#"commit -F "{}""#, message_path.display()));
    helper.git(&format!("push -f origin {lane}"));
    helper.git(&format!("checkout -f {default_branch}"));

    // 1. exports the squashed work onto the lane instead of declaring convergence
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> export-branch")));
    let on_lane = lane_tip_file(&dev_path, "comp1/index.js");
    assert!(on_lane.contains("squash-era-work"), "comp1/index.js on the lane tip:\n{on_lane}");

    // 2. a second run converges without pushing anything to the branch
    let sha_before = branch_tip_sha(&helper, lane);
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> noop (converged")));
    assert_eq!(branch_tip_sha(&helper, lane), sha_before);
}

#[test]
fn ci_sync_commit_touching_no_bit_tracked_file_probes_without_writing() {
    let helper = Helper::new();
    let lane = "docs-only-lane";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("lane-snap-1"))],
        "lane snap 1",
        "",
    );
    seed_sync(&helper, lane);
    branch_side_commit(&helper, lane, &default_branch, "NOTES.md", "# notes\n", "docs: add notes");
    let docs_tip_sha = branch_tip_sha(&helper, lane);

    // 1. finds nothing to export and pushes nothing — twice, the docs commit staying the tip
    let (first_out, first_code) = sync_run(&helper, lane);
    assert_eq!(first_code, 0, "bit ci sync output:\n{first_out}");
    assert!(first_out.contains(&format!("{lane} -> export-branch")));
    assert!(first_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), docs_tip_sha);

    let (second_out, second_code) = sync_run(&helper, lane);
    assert_eq!(second_code, 0, "bit ci sync output:\n{second_out}");
    assert!(second_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), docs_tip_sha);

    // 2. a real dev commit on top of the settled tip exports again
    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp1/index.js",
        &comp1_src("dev-commit-after-settle"),
        "dev commit after settling",
    );
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("Exporting branch"));
    assert!(output.contains(&format!("{lane} -> export-branch")));
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("dev-commit-after-settle"));
}

#[test]
fn ci_sync_on_conflict_resolves_same_line_divergence_automatically() {
    let helper = Helper::new();
    let lane = "policy-lane";

    let (default_branch, _) =
        setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"], "onConflict": "git-wins" })));
    let dev_path = create_lane_with_snap(
        &helper,
        lane,
        &[("comp1/index.js", &comp1_src("lane-snap-1"))],
        "lane snap 1",
        "",
    );
    seed_sync(&helper, lane);

    // 1. git-wins: should keep the branch's contested line, take the lane's rest, advance the lane, converge
    lane_side_edit(&dev_path, "comp1/index.js", &comp1_src("lane-take"), "lane conflicting snap");
    lane_side_edit(&dev_path, "comp2/index.js", &comp2_src("lane-side-2"), "lane edits comp2");
    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp1/index.js",
        &comp1_src("branch-take"),
        "feat: dev edits the same comp1 line on the branch",
    );
    let lane_before = remote_lane_fingerprint(&helper, lane);
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!(
        "{lane} -> merge-diverged (conflicts auto-resolved: git-wins on 1 file(s); merged lane into branch, then exported;"
    )));
    let on_branch = file_on_branch(&helper, lane, "comp1/index.js");
    assert!(on_branch.contains("branch-take"), "comp1/index.js on origin/{lane}:\n{on_branch}");
    assert!(!on_branch.contains("lane-take"));
    assert!(!on_branch.contains("<<<<<<<"));
    assert!(file_on_branch(&helper, lane, "comp2/index.js").contains("lane-side-2"));
    assert_ne!(remote_lane_fingerprint(&helper, lane), lane_before);
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("branch-take"));
    assert!(lane_tip_file(&dev_path, "comp2/index.js").contains("lane-side-2"));
    assert!(branch_tip_message(&helper, lane).contains("[bit-sync]"));
    let tip = branch_tip_sha(&helper, lane);
    let (rerun_out, rerun_code) = sync_run(&helper, lane);
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains(&format!("{lane} -> noop (converged)")));
    assert_eq!(branch_tip_sha(&helper, lane), tip);

    // 2. lane-wins: should take the LANE's version of the contested line onto the branch, with no markers
    set_sync_config(&helper, json!({ "lanes": ["*"], "onConflict": "lane-wins" }));
    helper.git("add workspace.jsonc");
    helper.git(r#"commit -m "config: onConflict lane-wins""#);
    helper.git(&format!("push origin {default_branch}"));
    lane_side_edit(
        &dev_path,
        "comp1/index.js",
        &comp1_src("lane-take-2"),
        "lane conflicting snap 2",
    );
    branch_side_commit(
        &helper,
        lane,
        &default_branch,
        "comp1/index.js",
        &comp1_src("branch-take-2"),
        "feat: dev edits the same comp1 line again",
    );
    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("conflicts auto-resolved: lane-wins on 1 file(s)"));
    let on_branch = file_on_branch(&helper, lane, "comp1/index.js");
    assert!(on_branch.contains("lane-take-2"), "comp1/index.js on origin/{lane}:\n{on_branch}");
    assert!(!on_branch.contains("branch-take-2"));
    assert!(!on_branch.contains("<<<<<<<"));
    assert!(lane_tip_file(&dev_path, "comp1/index.js").contains("lane-take-2"));
}

#[test]
fn ci_sync_lane_component_tracked_as_new_and_unexported() {
    let helper = Helper::new();
    let lane = "first-lane-export";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    helper.output_file("comp3/index.js", r#"module.exports = () => "comp3: initial";"#);
    helper.add_component("comp3", "");
    helper.git("add .");
    helper.git(r#"commit -m "track comp3 as a new component""#);
    helper.git(&format!("push origin {default_branch}"));
    create_lane_with_snap(
        &helper,
        lane,
        &[("comp3/index.js", r#"module.exports = () => "comp3: lane-snap-1";"#)],
        "comp3 first snap",
        "",
    );

    let (output, exit_code) = sync_run(&helper, lane);
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> import-lane")));
    assert!(remote_branch_exists(&helper, lane));
    let on_branch = file_on_branch(&helper, lane, "comp3/index.js");
    assert!(
        on_branch.contains("comp3: lane-snap-1"),
        "comp3/index.js on origin/{lane}:\n{on_branch}",
    );
    assert!(file_on_branch(&helper, lane, ".bitmap").contains(lane));
    assert_eq!(helper.git("branch --show-current").trim(), default_branch);
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("main"));
}
