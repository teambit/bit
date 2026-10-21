//! Cases from `e2e/harmony/ci-bitmap-auto-sync.e2e.ts`.

use crate::{
    helper::{Helper, parse},
    known_failure::KnownResult,
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn setup_git_remote(helper: &Helper) -> PathBuf {
    let (_, scope_path) = helper.new_bare_scope();
    let bare_repo_path = helper.scopes.e2e_dir.join(format!(
        "{}.git",
        scope_path
            .file_name()
            .unwrap()
            .to_string_lossy(),
    ));
    Helper::git_in(&helper.scopes.e2e_dir, &format!("init --bare {}", bare_repo_path.display()));
    helper.init_new_git_repo();
    helper.git(&format!("remote add origin {}", bare_repo_path.display()));
    bare_repo_path
}

fn setup_components_and_initial_commit(helper: &Helper, num_components: usize) -> String {
    helper.populate_components(num_components, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.output_file(".gitignore", "node_modules/\n.bit/\n");
    helper.git("add .");
    helper.git(r#"commit -m "initial commit""#);
    let branch = helper
        .git("branch --show-current")
        .trim()
        .to_owned();
    helper.git(&format!("push -u origin {branch}"));
    branch
}

fn enable_bitmap_auto_sync(helper: &Helper) {
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["bitmapAutoSync"] = json!(true);
    helper.write_workspace_jsonc(&ws);
}

fn commit_and_push_workspace_jsonc(helper: &Helper, branch: &str) {
    helper.git("add workspace.jsonc");
    helper.git(r#"commit -m "chore: enable bitmapAutoSync""#);
    helper.git(&format!("push origin {branch}"));
}

fn simulate_pr_merged_on_default_branch(
    helper: &Helper,
    branch: &str,
    feature_name: &str,
    file_changes: impl FnOnce(),
    commit_message: &str,
) {
    helper.git(&format!("checkout -b feature/{feature_name}"));
    file_changes();
    helper.git("add .");
    helper.git(&format!(r#"commit -m "{commit_message}""#));
    helper.git(&format!("checkout {branch}"));
    helper.git(&format!(r#"merge feature/{feature_name} --no-ff -m "Merge {feature_name}""#));
    helper.git(&format!("push origin {branch}"));
}

fn sentinel_path(helper: &Helper) -> PathBuf {
    helper.scopes.local_path.join(".bit/last-pull-sync")
}

fn bitmap_version(helper: &Helper, comp_id: &str) -> Option<String> {
    let bitmap = helper.read_bit_map();
    bitmap
        .get(comp_id)
        .or_else(|| bitmap.get(format!("{}/{comp_id}", helper.scopes.remote)))
        .and_then(|entry| entry["version"].as_str())
        .map(str::to_owned)
}

fn bitmap_entry(helper: &Helper, name: &str) -> Option<Value> {
    let bitmap = helper.read_bit_map();
    bitmap
        .as_object()?
        .iter()
        .find_map(|(k, v)| (k == name || v["name"].as_str() == Some(name)).then(|| v.clone()))
}

#[test]
fn ci_bitmap_auto_sync_regression_and_no_bitmap_commit_and_downstream() -> KnownResult<()> {
    let helper = Helper::new();

    // 1. regression: workspace WITHOUT bitmapAutoSync flag
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "regression-test",
        || helper.output_file("comp1/comp1.js", r#"console.log("regression");"#),
        "fix: comp1 update",
    );
    let merge_output = helper.run("ci merge");
    let log_after_merge = helper.git(&format!("log {branch} --oneline -n 5"));

    // should complete successfully
    assert!(merge_output.contains("Merged PR"), "{merge_output}");

    // should still create a CI commit on the default branch (existing behavior)
    let log_lower = log_after_merge.to_lowercase();
    assert!(
        log_lower.contains("skip ci")
            || log_lower.contains("update .bitmap")
            || log_lower.contains("bit ci"),
        "{log_after_merge}",
    );

    // should still tag the component
    let list = parse(&helper.native("list --json"));
    let comp1 = list
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        })
        .unwrap();
    assert_eq!(comp1["currentVersion"].as_str(), Some("0.0.2"));

    // 2. with bitmapAutoSync enabled and --no-bitmap-commit flag
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "no-commit-test",
        || helper.output_file("comp1/comp1.js", r#"console.log("no-commit");"#),
        "feat: comp1 update for no-commit",
    );
    let origin_head_before = helper
        .git(&format!("rev-parse origin/{branch}"))
        .trim()
        .to_owned();
    let merge_output2 = helper.run(r#"ci merge --no-bitmap-commit --message "test""#);
    let origin_head_after = helper
        .git(&format!("rev-parse origin/{branch}"))
        .trim()
        .to_owned();
    let local_head_after = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();

    // should complete successfully
    assert!(merge_output2.contains("Merged PR"), "{merge_output2}");

    // should explicitly indicate the bitmap commit was skipped in output
    let merge2_lower = merge_output2.to_lowercase();
    assert!(
        (merge2_lower.contains("skipping") && merge2_lower.contains("bitmap commit"))
            || merge2_lower.contains("--no-bitmap-commit"),
        "{merge_output2}",
    );

    // should NOT push any new commit to origin from the CI side
    assert_eq!(origin_head_after, origin_head_before);

    // local HEAD should equal origin HEAD (no extra local commit either)
    assert_eq!(local_head_after, origin_head_after);

    // should still tag the component locally
    let list2 = parse(&helper.native("list --json"));
    let comp1_local = list2
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        })
        .unwrap();
    assert_eq!(comp1_local["currentVersion"].as_str(), Some("0.0.2"));

    // should still export the new version to the remote scope
    let remote_list = helper.list_remote_scope_parsed("");
    let comp1_remote = remote_list
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        })
        .unwrap();
    assert_eq!(comp1_remote["localVersion"].as_str(), Some("0.0.2"));

    // 3. downstream developer workspace auto-syncs after git pull
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);
    let dev_clone = helper.clone_workspace();
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "downstream-sync",
        || helper.output_file("comp1/comp1.js", r#"console.log("downstream");"#),
        "feat: comp1 update for downstream sync",
    );
    helper.run(r#"ci merge --no-bitmap-commit --message "downstream""#);
    helper.get_cloned_workspace(&dev_clone);

    // local .bitmap reflects the old version
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.1"));

    helper.git(&format!("pull origin {branch}"));

    // the .bitmap on disk has not yet been updated by Bit
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.1"));

    helper.status();

    // triggers auto-sync, updating .bitmap to scope HEAD (0.0.2)
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.2"));

    // writes the sentinel file recording the synced git HEAD
    let sp = sentinel_path(&helper);
    assert!(sp.is_file());
    let sentinel_content = fs::read_to_string(&sp)
        .unwrap()
        .trim()
        .to_owned();
    let current_git_head = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    assert!(sentinel_content.contains(&current_git_head));

    // reports a clean status (no outdated, no modified)
    helper.expect_status_to_be_clean();

    // leaves .bitmap as a local working-tree modification in git
    let git_status = helper
        .git("status --porcelain .bitmap")
        .trim()
        .to_owned();
    assert!(git_status.starts_with('M') && git_status.ends_with(".bitmap"), "{git_status}");
    Ok(())
}

#[test]
fn ci_bitmap_auto_sync_first_commands_and_sentinel_and_cycles() -> KnownResult<()> {
    let helper = Helper::new();

    // 4. auto-sync works regardless of which command runs first
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);
    let dev_clone = helper.clone_workspace();
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "first-command",
        || helper.output_file("comp1/comp1.js", r#"console.log("first-cmd");"#),
        "feat: comp1 update",
    );
    helper.run("ci merge --no-bitmap-commit");

    let run_as_first = |cmd: &str| -> Option<String> {
        helper.get_cloned_workspace(&dev_clone);
        helper.git(&format!("pull origin {branch}"));
        helper.run(cmd);
        bitmap_version(&helper, "comp1")
    };

    // `bit list` as first command syncs bitmap
    assert_eq!(run_as_first("list").as_deref(), Some("0.0.2"));

    // `bit show` as first command syncs bitmap
    assert_eq!(run_as_first("show comp1").as_deref(), Some("0.0.2"));

    // `bit log` as first command syncs bitmap
    assert_eq!(run_as_first("log comp1").as_deref(), Some("0.0.2"));

    // `bit compile` as first command syncs bitmap
    assert_eq!(run_as_first("compile").as_deref(), Some("0.0.2"));

    // 5. sentinel caching across commands at the same git HEAD
    helper.get_cloned_workspace(&dev_clone);
    helper.git(&format!("pull origin {branch}"));
    helper.status();
    let sp = sentinel_path(&helper);
    let mtime_before = fs::metadata(&sp)
        .unwrap()
        .modified()
        .unwrap();
    let content_before = fs::read_to_string(&sp).unwrap();
    helper.native("list");

    // sentinel file should be untouched after the second command (same git HEAD)
    let mtime_after = fs::metadata(&sp)
        .unwrap()
        .modified()
        .unwrap();
    let content_after = fs::read_to_string(&sp).unwrap();
    assert_eq!(mtime_after, mtime_before);
    assert_eq!(content_after, content_before);

    // 6. multiple sequential PR cycles
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);
    let dev_clone = helper.clone_workspace();

    // cycle 1: dev syncs to 0.0.2
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "cycle-1",
        || helper.output_file("comp1/comp1.js", r#"console.log("cycle-1");"#),
        "feat: cycle 1",
    );
    helper.run("ci merge --no-bitmap-commit");
    helper.get_cloned_workspace(&dev_clone);
    helper.git(&format!("pull origin {branch}"));
    helper.status();
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.2"));

    // cycle 2: dev syncs to 0.0.3
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "cycle-2",
        || helper.output_file("comp1/comp1.js", r#"console.log("cycle-2");"#),
        "feat: cycle 2",
    );
    helper.run("ci merge --no-bitmap-commit");
    helper.get_cloned_workspace(&dev_clone);
    helper.git(&format!("pull origin {branch}"));
    helper.status();
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.3"));

    // 7. continuous developer flow — multiple sync cycles in the same workspace
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);

    // cycle 1: bitmap syncs to 0.0.2
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "cont-cycle-1",
        || helper.output_file("comp1/comp1.js", r#"console.log("c1");"#),
        "feat: cycle 1",
    );
    helper.run("ci merge --no-bitmap-commit");
    helper.status();
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.2"));

    // cycle 2: same workspace (already-modified .bitmap from cycle 1), syncs to 0.0.3
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "cont-cycle-2",
        || helper.output_file("comp1/comp1.js", r#"console.log("c2");"#),
        "feat: cycle 2",
    );
    helper.run("ci merge --no-bitmap-commit");
    helper.status();
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.3"));

    // cycle 3: continues advancing without state corruption
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "cont-cycle-3",
        || helper.output_file("comp1/comp1.js", r#"console.log("c3");"#),
        "feat: cycle 3",
    );
    helper.run("ci merge --no-bitmap-commit");
    helper.status();
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.4"));

    // the sentinel reflects the latest synced HEAD after the chain of cycles
    let sentinel_text = fs::read_to_string(sentinel_path(&helper))
        .unwrap()
        .trim()
        .to_owned();
    let head = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    assert_eq!(sentinel_text, head);
    Ok(())
}

#[test]
fn ci_bitmap_auto_sync_feature_branches_and_new_components() -> KnownResult<()> {
    let helper = Helper::new();

    // 8. developer working on a git feature branch (Bit on main) — merging main in
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let main_branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &main_branch);
    let dev_clone = helper.clone_workspace();

    simulate_pr_merged_on_default_branch(
        &helper,
        &main_branch,
        "teammate-work",
        || helper.output_file("comp1/comp1.js", r#"console.log("teammate");"#),
        "feat: teammate update",
    );
    helper.run("ci merge --no-bitmap-commit");

    helper.get_cloned_workspace(&dev_clone);
    helper.git("checkout -b feature/dev-work");
    helper.output_file("comp2/comp2.js", r#"console.log("dev local work");"#);
    helper.git("add .");
    helper.git(r#"commit -m "wip: dev work on feature branch""#);

    // before merging main: dev .bitmap is still at the original 0.0.1
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.1"));

    helper.git(&format!("fetch origin {main_branch}"));
    helper.git(&format!("merge origin/{main_branch} --no-edit"));

    // git status shows we are still on the feature branch (Bit lane is still main)
    assert_eq!(helper.git("branch --show-current").trim(), "feature/dev-work");
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("main"));

    helper.status();

    // auto-sync runs and updates .bitmap to scope HEAD (0.0.2)
    assert_eq!(bitmap_version(&helper, "comp1").as_deref(), Some("0.0.2"));

    // sentinel records the feature branch HEAD (the merge commit)
    let sentinel_text = fs::read_to_string(sentinel_path(&helper))
        .unwrap()
        .trim()
        .to_owned();
    assert_eq!(sentinel_text, helper.git("rev-parse HEAD").trim());

    // 9. first bit command is `bit ci pr` on a stale feature branch
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let main_branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &main_branch);
    let dev_clone = helper.clone_workspace();

    simulate_pr_merged_on_default_branch(
        &helper,
        &main_branch,
        "teammate-merged",
        || helper.output_file("comp1/comp1.js", r#"console.log("teammate");"#),
        "feat: teammate update",
    );
    helper.run("ci merge --no-bitmap-commit");

    helper.get_cloned_workspace(&dev_clone);
    helper.git("checkout -b feature/no-local-bit");
    helper.output_file("comp1/comp1.js", r#"console.log("dev");"#);
    helper.git("add .");
    helper.git(r#"commit -m "feat: dev change""#);
    helper.git("push -u origin feature/no-local-bit");
    let pr_output = helper.run(r#"ci pr --message "stale-branch PR""#);

    // starts the test with .bitmap reflecting the post-sync version (0.0.2)
    let ver = bitmap_version(&helper, "comp1").unwrap();
    assert!(ver == "0.0.2" || ver.len() == 40, "{ver}");

    // bit ci pr completes successfully despite the stale starting state
    assert!(pr_output.contains("PR command executed successfully"), "{pr_output}");

    // creates the lane and exports it
    let remote_lanes =
        parse(&helper.native(&format!("lane list --remote {} --json", helper.scopes.remote)));
    let lane = remote_lanes["lanes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|lane| {
            lane["name"].as_str() == Some("feature-no-local-bit")
                || lane["id"]["name"].as_str() == Some("feature-no-local-bit")
        })
        .expect("lane feature-no-local-bit should exist");
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    // the sentinel was advanced (auto-sync ran during the bit ci pr bootstrap)
    assert!(sentinel_path(&helper).is_file());

    // 10. first sync after a PR introduces a brand-new component
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let main_branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &main_branch);
    let dev_clone = helper.clone_workspace();

    let new_comp = "comp-new";
    helper.git("checkout -b feature/add-new-comp");
    helper.output_file(
        &format!("{new_comp}/{new_comp}.js"),
        &format!(r#"console.log("{new_comp}");"#),
    );
    helper.add_component(new_comp, "");
    helper.git("add .");
    helper.git(r#"commit -m "feat: add comp-new""#);
    helper.git(&format!("checkout {main_branch}"));
    helper.git(r#"merge feature/add-new-comp --no-ff -m "Merge add-new-comp""#);
    helper.git(&format!("push origin {main_branch}"));
    helper.run("ci merge --no-bitmap-commit");

    helper.get_cloned_workspace(&dev_clone);
    helper.git(&format!("pull origin {main_branch}"));

    // after pull, .bitmap entry for comp-new has no scope or version yet (it is the merged-but-unsynced state)
    let entry_before = bitmap_entry(&helper, new_comp).expect("comp-new should be in bitmap");
    assert_eq!(entry_before["scope"].as_str().unwrap_or(""), "");
    assert_eq!(entry_before["version"].as_str().unwrap_or(""), "");

    helper.status();

    // comp-new in .bitmap should be promoted to its tagged state (scope + version)
    let entry_after = bitmap_entry(&helper, new_comp).expect("comp-new should be in bitmap");
    assert_eq!(entry_after["scope"].as_str(), Some(helper.scopes.remote.as_str()));
    assert_eq!(entry_after["version"].as_str(), Some("0.0.1"));

    // `bit list` shows comp-new at 0.0.1
    let list_new = parse(&helper.native("list --json"));
    let found_new = list_new
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains(new_comp))
        })
        .unwrap();
    assert_eq!(found_new["currentVersion"].as_str(), Some("0.0.1"));

    // 11. fresh clone after a PR introduced a brand-new component (workspace2)
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let main_branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &main_branch);

    let new_comp_clone = "comp-new-clone";
    helper.git("checkout -b feature/add-new-comp-clone");
    helper.output_file(
        &format!("{new_comp_clone}/{new_comp_clone}.js"),
        &format!(r#"console.log("{new_comp_clone}");"#),
    );
    helper.add_component(new_comp_clone, "");
    helper.git("add .");
    helper.git(r#"commit -m "feat: add comp-new-clone""#);
    helper.git(&format!("checkout {main_branch}"));
    helper.git(r#"merge feature/add-new-comp-clone --no-ff -m "Merge add-new-comp-clone""#);
    helper.git(&format!("push origin {main_branch}"));
    helper.run("ci merge --no-bitmap-commit");

    let _ = fs::remove_dir_all(helper.scopes.local_path.join(".bit"));
    let _ = fs::remove_dir_all(helper.scopes.local_path.join("node_modules"));
    helper.run("init");
    helper.git(&format!("fetch origin {main_branch}"));
    helper.git(&format!("reset --hard origin/{main_branch}"));
    helper.add_remote_scope();

    // the freshly-cloned .bitmap shows comp-new-clone in its untagged form
    let clone_entry_before = bitmap_entry(&helper, new_comp_clone).unwrap();
    assert_eq!(clone_entry_before["scope"].as_str().unwrap_or(""), "");
    assert_eq!(clone_entry_before["version"].as_str().unwrap_or(""), "");

    helper.status();

    // comp-new-clone in .bitmap should be promoted to its tagged state
    let clone_entry_after = bitmap_entry(&helper, new_comp_clone).unwrap();
    assert_eq!(clone_entry_after["scope"].as_str(), Some(helper.scopes.remote.as_str()));
    assert_eq!(clone_entry_after["version"].as_str(), Some("0.0.1"));
    Ok(())
}

#[test]
fn ci_bitmap_auto_sync_edge_cases_and_guards() -> KnownResult<()> {
    let helper = Helper::new();

    // 12. developer on a Bit lane — auto-sync is skipped
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let main_branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &main_branch);
    helper.create_lane("feature-lane", "");
    let sentinel_before = fs::read_to_string(sentinel_path(&helper))
        .unwrap_or_default()
        .trim()
        .to_owned();
    helper.output_file("comp1/comp1.js", r#"console.log("on lane");"#);
    helper.git("add .");
    helper.git(r#"commit -m "wip on lane""#);
    helper.status();

    // we are on the Bit lane, not main
    let lanes = parse(&helper.native("lane list --json"));
    assert_eq!(lanes["currentLane"].as_str(), Some("feature-lane"));

    // sentinel did NOT advance to the lane-side git HEAD (lane guard suppressed sync)
    let current_git_head = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    let sentinel_after = fs::read_to_string(sentinel_path(&helper))
        .unwrap_or_default()
        .trim()
        .to_owned();
    assert_eq!(sentinel_after, sentinel_before);
    assert_ne!(sentinel_after, current_git_head);

    // 13. --no-bitmap-commit CLI flag without the workspace flag
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "cli-flag-only",
        || helper.output_file("comp1/comp1.js", r#"console.log("cli-only");"#),
        "feat: cli flag only",
    );
    let origin_head_before = helper
        .git(&format!("rev-parse origin/{branch}"))
        .trim()
        .to_owned();
    helper.run("ci merge --no-bitmap-commit");
    let origin_head_after = helper
        .git(&format!("rev-parse origin/{branch}"))
        .trim()
        .to_owned();

    // should skip the commit (CLI flag works standalone)
    assert_eq!(origin_head_after, origin_head_before);

    // should still tag and export to remote scope
    let remote_list = helper.list_remote_scope_parsed("");
    let comp1 = remote_list
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        })
        .unwrap();
    assert_eq!(comp1["localVersion"].as_str(), Some("0.0.2"));

    // should NOT create a sentinel file (workspace flag is off)
    assert!(!sentinel_path(&helper).exists());

    // 14. multiple components — all bitmap entries mirror scope HEAD after sync
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 3);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);
    let dev_clone = helper.clone_workspace();
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "multi-comp",
        || {
            helper.output_file("comp1/comp1.js", r#"console.log("c1 updated");"#);
            helper.output_file("comp3/comp3.js", r#"console.log("c3 updated");"#);
        },
        "feat: update components",
    );
    helper.run("ci merge --no-bitmap-commit");
    helper.get_cloned_workspace(&dev_clone);
    helper.git(&format!("pull origin {branch}"));
    helper.status();

    // every component in the bitmap should match its scope HEAD
    let remote = helper.list_remote_scope_parsed("");
    let local = parse(&helper.native("list --json"));
    let local_arr = local.as_array().unwrap();
    assert!(!local_arr.is_empty());
    for lc in local_arr {
        let rc = remote
            .as_array()
            .unwrap()
            .iter()
            .find(|comp| comp["id"] == lc["id"]);
        if let Some(rc) = rc {
            assert_eq!(lc["currentVersion"], rc["localVersion"]);
        }
    }

    // the modified components (comp1, comp3) should be at the new tag (0.0.2)
    let c1 = local_arr
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        })
        .unwrap();
    let c3 = local_arr
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp3"))
        })
        .unwrap();
    assert_eq!(c1["currentVersion"].as_str(), Some("0.0.2"));
    assert_eq!(c3["currentVersion"].as_str(), Some("0.0.2"));

    // status should be clean across all components
    helper.expect_status_to_be_clean();

    // 15. workspace without git: graceful skip
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    enable_bitmap_auto_sync(&helper);

    // bit status should run successfully without erroring on the missing git
    let status_out = helper.status();
    assert!(!status_out.contains("ENOENT"), "{status_out}");

    // should NOT create a sentinel file when there is no git
    assert!(!sentinel_path(&helper).exists());

    // bit list should report the locally-known version (no sync attempted)
    let list_nogit = parse(&helper.native("list --json"));
    let c1_nogit = list_nogit
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        })
        .unwrap();
    assert_eq!(c1_nogit["currentVersion"].as_str(), Some("0.0.1"));

    // 16. git HEAD changed but no actual scope-vs-bitmap drift
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);
    let dev_clone = helper.clone_workspace();
    helper.output_file("README.md", "# updated docs only\n");
    helper.git("add README.md");
    helper.git(r#"commit -m "docs: update readme""#);
    helper.git(&format!("push origin {branch}"));
    helper.get_cloned_workspace(&dev_clone);
    let bitmap_before = helper.read_bit_map();
    helper.git(&format!("pull origin {branch}"));
    helper.status();

    // .bitmap should be byte-identical to before the sync (no spurious rewrites)
    let bitmap_after = helper.read_bit_map();
    assert_eq!(bitmap_after, bitmap_before);

    // the sentinel should still advance to the current git HEAD
    assert!(sentinel_path(&helper).is_file());
    let sentinel_text = fs::read_to_string(sentinel_path(&helper))
        .unwrap()
        .trim()
        .to_owned();
    assert_eq!(sentinel_text, helper.git("rev-parse HEAD").trim());

    // 17. graceful degradation when remote scope is unreachable
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);
    let dev_clone = helper.clone_workspace();
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "remote-unreachable",
        || helper.output_file("comp1/comp1.js", r#"console.log("unreachable");"#),
        "feat: simulate remote loss",
    );
    helper.run("ci merge --no-bitmap-commit");
    helper.get_cloned_workspace(&dev_clone);
    helper.git(&format!("pull origin {branch}"));
    let _ = fs::remove_dir_all(&helper.scopes.remote_path);
    let bitmap_before_cmd = helper.read_bit_map();

    // bit status should complete without throwing
    let st_out = helper.status();
    assert!(!st_out.is_empty());

    // local .bitmap should not be corrupted by the failed remote
    let bitmap_after_cmd = helper.read_bit_map();
    for k in bitmap_before_cmd
        .as_object()
        .unwrap()
        .keys()
    {
        if !k.starts_with('$') {
            assert!(bitmap_after_cmd.get(k).is_some());
        }
    }

    // 18. bitmapAutoSync enabled but legacy `bit ci merge` (commit + push) used
    helper.set_workspace_with_remote_scope();
    setup_git_remote(&helper);
    let branch = setup_components_and_initial_commit(&helper, 2);
    enable_bitmap_auto_sync(&helper);
    commit_and_push_workspace_jsonc(&helper, &branch);
    simulate_pr_merged_on_default_branch(
        &helper,
        &branch,
        "transitional",
        || helper.output_file("comp1/comp1.js", r#"console.log("transitional");"#),
        "feat: transitional path",
    );
    let merge_legacy = helper.run(r#"ci merge --message "transitional""#);

    // legacy commit+push still works when --no-bitmap-commit is omitted
    assert!(merge_legacy.contains("Merged PR"), "{merge_legacy}");
    let log_legacy = helper
        .git(&format!("log {branch} --oneline -n 5"))
        .to_lowercase();
    assert!(
        log_legacy.contains("skip ci")
            || log_legacy.contains("update .bitmap")
            || log_legacy.contains("bit ci"),
        "{log_legacy}",
    );

    // component is tagged and exported
    let remote_legacy = helper.list_remote_scope_parsed("");
    let c1_legacy = remote_legacy
        .as_array()
        .unwrap()
        .iter()
        .find(|comp| {
            comp["id"]
                .as_str()
                .is_some_and(|id| id.contains("comp1"))
        })
        .unwrap();
    assert_eq!(c1_legacy["localVersion"].as_str(), Some("0.0.2"));
    Ok(())
}
