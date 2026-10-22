//! `e2e/harmony/lanes/lane-import-git-branch.e2e.ts`.

use crate::helper::{Helper, parse};
use std::process::Command;

fn git(cwd: &std::path::Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?} failed: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn init_new_git_repo(helper: &Helper) {
    let cwd = &helper.scopes.local_path;
    git(cwd, &["init", "-b", "main"]);
    git(cwd, &["config", "user.name", "Test User"]);
    git(cwd, &["config", "user.email", "test@example.com"]);
    helper.write_file(".gitignore", "node_modules/\n.bit/\n");
    git(cwd, &["add", "."]);
    git(cwd, &["commit", "-m", "initial commit"]);
}

#[test]
fn importing_an_exported_lane_into_a_git_repo_when_no_git_branch_exists() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("lane create my-test-lane");
    helper.native("snap --skip-tests");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    init_new_git_repo(&helper);
    let lane_id = format!("{}/my-test-lane", helper.scopes.remote);
    helper.run_cmd(&format!("lane import {lane_id} --branch"));

    // 1. should import the lane successfully
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("my-test-lane"));

    // 2. should checkout to the branch with the same name as the lane id
    let git_branch = git(&helper.scopes.local_path, &["branch", "--show-current"]);
    assert_eq!(git_branch.trim(), lane_id);
}

#[test]
fn importing_an_exported_lane_into_a_git_repo_when_git_branch_already_exists() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("lane create my-test-lane");
    helper.native("snap --skip-tests");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    init_new_git_repo(&helper);
    let lane_id = format!("{}/my-test-lane", helper.scopes.remote);
    git(&helper.scopes.local_path, &["branch", &lane_id]);
    let import_output = helper.run_cmd(&format!("lane import {lane_id} --branch"));

    // 3. should warn that the git branch could not be created
    assert!(import_output.contains("Failed to create git branch"));
    assert!(import_output.contains(&format!("fatal: a branch named '{lane_id}' already exists")));

    // 4. should still import the lane successfully
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("my-test-lane"));
}

#[test]
fn import_lane_after_remote_lane_changes() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");

    let bare_git_dir = helper.scopes.e2e_dir.join("bare-repo.git");
    git(&helper.scopes.e2e_dir, &["init", "--bare", bare_git_dir.to_str().unwrap()]);
    init_new_git_repo(&helper);
    git(&helper.scopes.local_path, &["remote", "add", "origin", bare_git_dir.to_str().unwrap()]);
    git(&helper.scopes.local_path, &["push", "-u", "origin", "main"]);

    let workspace_backup = helper.clone_workspace();

    let lane_id = format!("{}/my-test-lane", helper.scopes.remote);
    helper.native("lane create my-test-lane");
    let existing = helper.read_file("comp1/index.js");
    helper.write_file("comp1/index.js", &format!("{existing}\n console.log(1)"));
    helper.native("snap --skip-tests");
    helper.native("export");

    helper.get_cloned_workspace(&workspace_backup);
    helper.run_cmd(&format!("lane import {lane_id} --branch"));
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("my-test-lane"));

    git(&helper.scopes.local_path, &["add", "."]);
    git(&helper.scopes.local_path, &["commit", "-m", "commit on a PR"]);
    git(&helper.scopes.local_path, &["push", "origin", "main"]);

    // 5. switching git back to main should switch the lane as well to main and keep status clean
    git(&helper.scopes.local_path, &["checkout", "main"]);
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("main"));
    helper.expect_status_to_be_clean();
}
