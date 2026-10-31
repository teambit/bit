//! E2E tests for `bit ci sync: main-scope reconciliation`.
//!
//! Ported from:
//! - `e2e/harmony/ci-sync-main.e2e.ts`

use super::support::{
    NO_GIT_HOST_WARNING, branch_paths_matching, branch_tip_message, branch_tip_sha, comp1_src,
    comp2_src, create_lane_with_snap, file_on_branch, git_fetch, remote_branch_exists, remote_refs,
    run_bit, run_bit_in, seed_sync, setup_sync_workspace, sync_run,
};
use crate::helper::{Helper, parse};
use serde_json::json;
use std::fs;

const SYNC_BRANCH_MAIN: &str = "bit-sync/main";

#[test]
fn ci_sync_main_scope_sync_and_dry_run() {
    let helper = Helper::new();
    let lane = "dry-lane";
    let sync_branch = "bit-sync/main";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"] })));
    create_lane_with_snap(
        &helper,
        lane,
        &[("comp2/index.js", &comp2_src("dry-lane-snap"))],
        "dry lane snap",
        "",
    );
    let dev_main_path = helper.clone_workspace();

    fs::write(dev_main_path.join("comp1/index.js"), comp1_src("main-scope-v2")).unwrap();
    fs::write(dev_main_path.join("comp2/index.js"), comp2_src("main-scope-v2")).unwrap();
    assert!(
        Helper::cmd_in(
            &dev_main_path,
            r#"tag --skip-tests --message "bump both components on main""#
        )
        .status
        .success(),
    );
    assert!(Helper::cmd_in(&dev_main_path, "export").status.success());

    helper.output_file("comp1/index.js", &comp1_src("unexported-git-drift"));
    helper.git("add -A");
    helper.git(r#"commit -m "chore: source drift that was never exported""#);
    helper.git(&format!("push origin {default_branch}"));
    git_fetch(&helper);

    // F: --all --dry-run plans an action per target and leaves every ref on the git remote untouched
    let refs_before = remote_refs(&helper);
    let (output, exit_code) = sync_run(&helper, "--all --dry-run");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("Dry-run"));
    assert!(output.contains(&format!("{lane} -> import-lane")));
    assert!(output.contains("would open sync PR"));
    assert!(output.contains("main -> drift in"));
    assert_eq!(remote_refs(&helper), refs_before);
    assert!(!remote_branch_exists(&helper, lane));
    assert!(!remote_branch_exists(&helper, sync_branch));

    // F2: a --dry-run that plans a first-contact adoption reports it and exits 0
    let refs_before = remote_refs(&helper);
    helper.git(&format!("checkout -f -b {lane} origin/{default_branch}"));
    helper.output_file("docs/plan.md", "dev work this repository never gave bit any state for\n");
    helper.git("add -A");
    helper.git(r#"commit -m "docs: dev work on a lane-mapped branch""#);
    helper.git(&format!("push origin {lane}"));
    helper.git(&format!("checkout -f {default_branch}"));
    let (output, exit_code) = sync_run(&helper, &format!("{lane} --dry-run"));
    helper.git(&format!("push origin :refs/heads/{lane}"));
    helper.git(&format!("branch -D {lane}"));
    git_fetch(&helper);

    assert_eq!(exit_code, 0, "bit ci sync --dry-run output:\n{output}");
    assert!(output.contains(&format!("Dry-run: {lane} -> adopt-branch")));
    assert!(!output.contains("HALTED"));
    assert_eq!(remote_refs(&helper), refs_before);

    // E: --main pushes the scope-resolved drift onto the sync branch, never the default branch, then converges
    let (output, exit_code) = sync_run(&helper, "--main");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(!output.contains("HALTED"));
    assert!(!output.contains("auto-merge-resolve"));
    assert!(output.contains(&format!("main -> pushed sync commit to {sync_branch}")));
    assert!(output.contains(NO_GIT_HOST_WARNING));
    assert!(output.contains("pushed sync branch, skipping PR operations"));
    assert!(remote_branch_exists(&helper, sync_branch));
    let message = branch_tip_message(&helper, sync_branch);
    assert!(message.contains("[bit-sync]"));
    assert!(message.contains("chore(bit-sync): sync git to latest main scope versions"));
    assert!(file_on_branch(&helper, sync_branch, "comp2/index.js").contains("main-scope-v2"));
    let on_branch = file_on_branch(&helper, sync_branch, "comp1/index.js");
    assert!(
        on_branch.contains("main-scope-v2"),
        "comp1/index.js on origin/{sync_branch}:\n{on_branch}",
    );
    assert!(!on_branch.contains("unexported-git-drift"));
    assert!(
        file_on_branch(&helper, &default_branch, "comp1/index.js").contains("unexported-git-drift"),
    );
    assert!(file_on_branch(&helper, &default_branch, "comp2/index.js").contains("comp2: initial"));
    assert_eq!(helper.git("branch --show-current").trim(), default_branch);
    let tip = branch_tip_sha(&helper, sync_branch);
    let (rerun_out, rerun_code) = sync_run(&helper, "--main");
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains("main -> converged"));
    assert_eq!(branch_tip_sha(&helper, sync_branch), tip);

    // --all reconciles the lane and the main scope in one run
    let (output, exit_code) = sync_run(&helper, "--all");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains(&format!("{lane} -> import-lane")));
    assert!(output.contains("main ->"));
    assert!(remote_branch_exists(&helper, lane));
    assert!(file_on_branch(&helper, lane, "comp2/index.js").contains("dry-lane-snap"));
    assert!(branch_tip_message(&helper, lane).contains("Bit-Lane-Head:"));

    // --main --dry-run over uncommitted work refuses, and leaves that work exactly as it was
    let edit = comp1_src("uncommitted-local-edit-that-must-survive");
    let untracked_dir = "scratch";
    helper.output_file("comp1/index.js", &edit);
    helper.output_file(&format!("{untracked_dir}/notes.txt"), "untracked scratch\n");

    let (output, exit_code) = run_bit(&helper, "bit ci sync --main --dry-run");
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("--dry-run refuses to run"));
    assert!(output.contains("comp1/index.js"));
    assert!(output.contains("Commit or stash them first"));
    assert_eq!(helper.read_file("comp1/index.js"), edit);
    assert!(
        helper.scopes.local_path
            .join(untracked_dir)
            .join("notes.txt")
            .exists(),
    );

    helper.git("checkout -- comp1/index.js");
    helper.delete_path(untracked_dir);
}

#[test]
fn ci_sync_main_recovers_from_bitmap_entry_whose_main_file_no_longer_exists() {
    let helper = Helper::new();
    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({ "lanes": [] })));
    let dev_main_path = helper.clone_workspace();

    fs::write(dev_main_path.join("comp1/main.js"), comp1_src("main-file-moved")).unwrap();
    fs::remove_file(dev_main_path.join("comp1/index.js")).unwrap();
    assert!(
        Helper::cmd_in(&dev_main_path, "add comp1 --main main.js --id comp1")
            .status
            .success(),
    );
    fs::write(dev_main_path.join("comp2/renamed.js"), comp2_src("main-file-moved")).unwrap();
    fs::remove_file(dev_main_path.join("comp2/index.js")).unwrap();
    assert!(
        Helper::cmd_in(&dev_main_path, "add comp2 --main renamed.js --id comp2")
            .status
            .success(),
    );
    assert!(
        Helper::cmd_in(&dev_main_path, r#"tag --skip-tests --message "move both main files""#)
            .status
            .success(),
    );
    assert!(Helper::cmd_in(&dev_main_path, "export").status.success());

    helper.output_file("comp1/main.js", &comp1_src("main-file-moved"));
    helper.delete_path("comp1/index.js");
    helper.delete_path("comp2/index.js");
    helper.git("add -A");
    helper.git(r#"commit -m "chore: main files moved; .bitmap still names the old ones""#);
    helper.git(&format!("push origin {default_branch}"));
    git_fetch(&helper);

    // 1. should repair both entries instead of failing, and open the sync PR
    let (output, exit_code) = sync_run(&helper, "--main");
    assert_eq!(exit_code, 0, "bit ci sync --main output:\n{output}");
    assert!(!output.contains("was removed from"));
    assert!(!output.contains("HALTED"));
    assert!(output.contains("Repointed 1 .bitmap entr"));
    assert!(output.contains("main.js"));
    assert!(output.contains("Untracked 1 component(s)"));
    assert!(remote_branch_exists(&helper, SYNC_BRANCH_MAIN));

    // 2. should leave a loadable workspace on the sync branch: comp1 in place, comp2 re-imported
    let bitmap = file_on_branch(&helper, SYNC_BRANCH_MAIN, ".bitmap");
    assert!(bitmap.contains(r#""mainFile": "main.js""#));
    assert!(bitmap.contains(r#""rootDir": "comp1""#));
    assert!(bitmap.contains(r#""mainFile": "renamed.js""#));
    assert!(!branch_paths_matching(&helper, SYNC_BRANCH_MAIN, "renamed.js").is_empty());

    // 3. a second run is converged - the heal is not re-applied every run
    let (output, exit_code) = sync_run(&helper, "--main");
    assert_eq!(exit_code, 0, "bit ci sync --main output:\n{output}");
    assert!(!output.contains("Repointed"));
    assert!(!output.contains("Untracked"));
}

#[test]
fn ci_sync_main_scope_direct_push() {
    let helper = Helper::new();
    let sync_branch = "bit-sync/main";

    let (default_branch, _) =
        setup_sync_workspace(&helper, Some(json!({ "lanes": ["*"], "mainSync": "direct-push" })));
    let dev_main_path = helper.clone_workspace();
    fs::write(dev_main_path.join("comp1/index.js"), comp1_src("direct-push-v2")).unwrap();
    assert!(
        Helper::cmd_in(&dev_main_path, r#"tag --skip-tests --message "bump comp1 on main""#)
            .status
            .success(),
    );
    assert!(Helper::cmd_in(&dev_main_path, "export").status.success());

    let (output, exit_code) = sync_run(&helper, "--main");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    let prefix = format!("main -> direct-push (pushed {default_branch} @ ");
    let rest = output
        .split(&prefix)
        .nth(1)
        .expect("expected direct-push summary");
    let sha_prefix = rest.split(')').next().unwrap();
    assert!(branch_tip_sha(&helper, &default_branch).starts_with(sha_prefix));
    let message = branch_tip_message(&helper, &default_branch);
    assert!(message.contains("[bit-sync]"));
    assert!(message.contains("chore(bit-sync): sync git to latest main scope versions"));
    assert!(file_on_branch(&helper, &default_branch, "comp1/index.js").contains("direct-push-v2"));
    assert!(!remote_branch_exists(&helper, sync_branch));
    assert!(!output.contains("skipping PR operations"));
    assert!(!output.contains("sync PR"));
    assert_eq!(helper.git("branch --show-current").trim(), default_branch);
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("main"));
    let tip = branch_tip_sha(&helper, &default_branch);
    let (rerun_out, rerun_code) = sync_run(&helper, "--main");
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains("main -> converged"));
    assert_eq!(branch_tip_sha(&helper, &default_branch), tip);
    assert!(!remote_branch_exists(&helper, sync_branch));
}

#[test]
fn ci_sync_stale_bit_sync_main_conflicting_with_default_branch() {
    let helper = Helper::new();
    let sync_branch = "bit-sync/main";

    let (default_branch, _) = setup_sync_workspace(&helper, Some(json!({})));
    let dev_path = helper.clone_workspace();
    fs::write(dev_path.join("comp1/index.js"), comp1_src("main-scope-v2")).unwrap();
    fs::write(dev_path.join("comp2/index.js"), comp2_src("main-scope-v2")).unwrap();
    assert!(
        Helper::cmd_in(&dev_path, r#"tag --skip-tests --message "bump to 0.0.2""#)
            .status
            .success(),
    );
    assert!(Helper::cmd_in(&dev_path, "export").status.success());
    seed_sync(&helper, "--main");

    fs::write(dev_path.join("comp1/index.js"), comp1_src("main-scope-v3")).unwrap();
    assert!(
        Helper::cmd_in(
            &dev_path,
            r#"tag comp1 --skip-tests --message "bump comp1 to 0.0.3" --unmodified"#
        )
        .status
        .success(),
    );
    assert!(Helper::cmd_in(&dev_path, "export").status.success());
    helper.run("checkout head comp1 -x");
    helper.git("add -A");
    helper.git(r#"commit -m "chore: adopt comp1 0.0.3""#);
    helper.git(&format!("push origin {default_branch}"));
    git_fetch(&helper);

    // 1. re-forks the machine-owned branch from the default branch and pushes the remaining drift
    let tip_before = branch_tip_sha(&helper, sync_branch);
    let (output, exit_code) = sync_run(&helper, "--main");
    assert_eq!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(!output.contains("HALTED"));
    assert!(output.contains("re-forking"));
    assert!(output.contains(&format!("main -> pushed sync commit to {sync_branch}")));
    assert_ne!(branch_tip_sha(&helper, sync_branch), tip_before);
    assert!(file_on_branch(&helper, sync_branch, "comp1/index.js").contains("main-scope-v3"));
    assert!(file_on_branch(&helper, sync_branch, "comp2/index.js").contains("main-scope-v2"));
    assert!(file_on_branch(&helper, sync_branch, ".bitmap").contains("0.0.3"));
    assert!(file_on_branch(&helper, &default_branch, "comp2/index.js").contains("comp2: initial"));
    let (rerun_out, rerun_code) = sync_run(&helper, "--main");
    assert_eq!(rerun_code, 0, "bit ci sync output:\n{rerun_out}");
    assert!(rerun_out.contains("main -> converged"));

    // 2. keeps the halt when a human commit sits on the sync branch
    helper.git(&format!("fetch origin {sync_branch}"));
    helper.git(&format!("checkout -B {sync_branch} origin/{sync_branch}"));
    helper.output_file("comp1/index.js", &comp1_src("human-edit-on-sync-branch"));
    helper.git("add -A");
    helper.git(r#"commit -m "fix: a human edit on the sync branch""#);
    helper.git(&format!("push origin {sync_branch}"));
    helper.git(&format!("checkout {default_branch}"));
    fs::write(dev_path.join("comp1/index.js"), comp1_src("main-scope-v4")).unwrap();
    assert!(
        Helper::cmd_in(
            &dev_path,
            r#"tag comp1 --skip-tests --message "bump comp1 to 0.0.4" --unmodified"#
        )
        .status
        .success(),
    );
    assert!(Helper::cmd_in(&dev_path, "export").status.success());
    helper.run("checkout head comp1 -x");
    helper.git("add -A");
    helper.git(r#"commit -m "chore: adopt comp1 0.0.4""#);
    helper.git(&format!("push origin {default_branch}"));
    git_fetch(&helper);

    let tip_before = branch_tip_sha(&helper, sync_branch);
    let (output, exit_code) = sync_run(&helper, "--main");
    assert_ne!(exit_code, 0, "bit ci sync output:\n{output}");
    assert!(output.contains("could not bring the sync branch"));
    assert!(!output.contains("re-forking"));
    assert_eq!(branch_tip_sha(&helper, sync_branch), tip_before);
    assert!(
        file_on_branch(&helper, sync_branch, "comp1/index.js")
            .contains("human-edit-on-sync-branch"),
    );
}

#[test]
fn ci_sync_init_onboarding_scaffolding() {
    let helper = Helper::new();
    let (default_branch, _) = setup_sync_workspace(&helper, None);

    let workflow_path =
        |ws: &Helper, name: &str| ws.scopes.local_path.join(".github/workflows").join(name);

    // 1. scaffolds both workflow files with the real default branch substituted
    let (output, exit_code) = run_bit(&helper, "bit ci sync --init");
    assert_eq!(exit_code, 0, "bit ci sync --init output:\n{output}");
    assert!(workflow_path(&helper, "bit-sync.yml").exists());
    assert!(workflow_path(&helper, "bit-release.yml").exists());

    let sync_yml = fs::read_to_string(workflow_path(&helper, "bit-sync.yml")).unwrap();
    let release_yml = fs::read_to_string(workflow_path(&helper, "bit-release.yml")).unwrap();
    assert!(sync_yml.contains(&format!("branches-ignore: ['{default_branch}', 'bit-sync/**']")));
    assert!(release_yml.contains(&format!("branches: ['{default_branch}']")));
    assert!(sync_yml.contains("main-sync-branch: bit-sync/main"));
    assert!(release_yml.contains("github.event.pull_request.head.ref != 'bit-sync/main'"));

    assert!(
        output
            .lines()
            .any(|line| line.contains(".github/workflows/bit-sync.yml")
                && line.contains("syncs lanes and branches")),
    );
    assert!(
        output
            .lines()
            .any(|line| line.contains(".github/workflows/bit-release.yml")
                && line.contains("releases the scope")),
    );
    assert!(
        output
            .lines()
            .any(|line| line.contains("workspace.jsonc")
                && line.contains(r#"added "teambit.git/ci": { "sync": {} }"#)),
    );
    let ws_jsonc = helper.read_workspace_jsonc();
    assert_eq!(ws_jsonc["teambit.git/ci"]["sync"], json!({}));

    assert_eq!(output.matches("Scaffolded bit ci sync").count(), 1);
    assert_eq!(output.matches("steps to go live").count(), 1);
    assert!(!output.contains("Initializing sync command"));
    assert!(output.contains(&format!("(default branch: {default_branch})")));
    assert!(!output.contains("GITHUB_SERVER_URL"));
    assert!(output.contains("git push -u origin HEAD"));
    assert!(output.contains("Run bit ci sync --init again"));

    // 2. is idempotent: a second run skips both files and the config block, and still exits 0
    let sync_yml_before = fs::read_to_string(workflow_path(&helper, "bit-sync.yml")).unwrap();
    let release_yml_before = fs::read_to_string(workflow_path(&helper, "bit-release.yml")).unwrap();
    let (output, exit_code) = run_bit(&helper, "bit ci sync --init");
    assert_eq!(exit_code, 0, "bit ci sync --init output:\n{output}");
    assert!(
        output
            .lines()
            .any(|line| line.contains(".github/workflows/bit-sync.yml")
                && line.contains("already exists, left unchanged")),
    );
    assert!(
        output
            .lines()
            .any(|line| line.contains(".github/workflows/bit-release.yml")
                && line.contains("already exists, left unchanged")),
    );
    assert!(
        output
            .lines()
            .any(|line| line.contains("workspace.jsonc")
                && line.contains("already configures sync, left unchanged")),
    );
    assert_eq!(
        fs::read_to_string(workflow_path(&helper, "bit-sync.yml")).unwrap(),
        sync_yml_before,
    );
    assert_eq!(
        fs::read_to_string(workflow_path(&helper, "bit-release.yml")).unwrap(),
        release_yml_before,
    );

    // 3. should write the workflows at the REPOSITORY root when the workspace is in a subdirectory
    let repo_root = helper.scopes.e2e_dir.join("subdir-repo");
    let ws_dir = repo_root.join("packages/app");
    fs::create_dir_all(&ws_dir).unwrap();
    Helper::git_in(&repo_root, "init");
    assert!(Helper::cmd_in(&ws_dir, "init").status.success());
    let (output, exit_code) = run_bit_in(&ws_dir, "bit ci sync --init");

    assert_eq!(exit_code, 0, "bit ci sync --init output:\n{output}");
    assert!(ws_dir.join("workspace.jsonc").exists());
    assert!(
        output
            .lines()
            .any(|line| line.contains("workspace.jsonc")
                && line.contains(r#"added "teambit.git/ci": { "sync": {} }"#)),
    );
    assert!(fs::read_to_string(ws_dir.join("workspace.jsonc")).unwrap().contains("teambit.git/ci"));
    assert!(!repo_root.join("workspace.jsonc").exists());

    assert!(repo_root.join(".github/workflows/bit-sync.yml").exists());
    assert!(repo_root.join(".github/workflows/bit-release.yml").exists());
    assert!(!ws_dir.join(".github").exists());
    assert!(
        output.contains(".github/workflows/bit-sync.yml")
            || output.contains(r".github\workflows\bit-sync.yml"),
    );
    assert!(!output.contains("wrote .github/workflows/bit-sync.yml"));
}
