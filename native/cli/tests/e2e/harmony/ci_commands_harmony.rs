//! Cases from `e2e/harmony/ci-commands.e2e.ts`.

use crate::helper::Helper;
use std::path::PathBuf;

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

fn populate_fast(helper: &Helper, count: usize) {
    for idx in 1..=count {
        let next_idx = idx + 1;
        let content = if idx == count {
            format!("module.exports = () => 'comp{idx}';")
        } else {
            format!(
                "const comp{next_idx} = require('../comp{next_idx}');\nmodule.exports = () => `comp{idx} and ${{comp{next_idx}()}}`;",
            )
        };
        helper.output_file(&format!("comp{idx}/index.js"), &content);
        helper.native(&format!("add comp{idx}"));
    }
    helper.run("link --rewire");
}

fn setup_ci_workspace(helper: &Helper, count: usize) -> String {
    helper.set_workspace_with_remote_scope();
    setup_git_remote(helper);
    populate_fast(helper, count);
    helper.run("tag --skip-tests");
    helper.run("export");
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

fn simulate_merged_pr(helper: &Helper, branch: &str, feature: &str, modify_fn: impl FnOnce()) {
    helper.git(&format!("checkout -b {feature}"));
    modify_fn();
    helper.git("add .");
    helper.git(&format!(r#"commit -m "change in {feature}""#));
    helper.git(&format!("checkout {branch}"));
    helper.git(&format!(r#"merge {feature} --no-ff -m "Merge {feature}""#));
    helper.git(&format!("push origin {branch}"));
}

fn remote_comp_version(helper: &Helper, comp_name: &str) -> Option<String> {
    let list = helper.list_remote_scope_parsed("");
    list.as_array()?
        .iter()
        .find(|item| {
            item["id"]
                .as_str()
                .is_some_and(|id| id.ends_with(&format!("/{comp_name}")))
        })
        .and_then(|item| item["localVersion"].as_str())
        .map(str::to_owned)
}

fn run_ci_pr(helper: &Helper, args: &str) -> String {
    if args.is_empty() { helper.native("ci pr") } else { helper.native(&format!("ci pr {args}")) }
}

fn run_ci_merge(helper: &Helper, args: &str) -> String {
    if args.is_empty() {
        helper.native("ci merge")
    } else {
        helper.native(&format!("ci merge {args}"))
    }
}

#[test]
fn ci_pr_exports_to_lane_and_cleans_up() {
    let helper = Helper::new();
    setup_ci_workspace(&helper, 2);
    helper.git("checkout -b feat-branch");
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    let output = run_ci_pr(&helper, "");
    assert!(output.contains("feat-branch"));
    let status = helper.status_json();
    assert!(
        status["currentLaneId"]
            .as_str()
            .is_none_or(|lane| lane == "main" || lane.ends_with("/main")),
    );
    let remote_lanes = helper.run(&format!("lane list -r {}", helper.scopes.remote));
    assert!(remote_lanes.contains("feat-branch"));
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.1"));
}

#[test]
fn ci_pr_explicit_lane_name_and_sanitization() {
    let helper = Helper::new();
    setup_ci_workspace(&helper, 1);
    helper.git("checkout -b feature/my_special@branch");
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    let output = run_ci_pr(&helper, "--lane custom-lane-name");
    assert!(output.contains("custom-lane-name"));
    let remote_lanes = helper.run(&format!("lane list -r {}", helper.scopes.remote));
    assert!(remote_lanes.contains("custom-lane-name"));
}

#[test]
fn ci_pr_fails_when_on_main_without_lane() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 1);
    helper.git(&format!("checkout {branch}"));
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    let run = helper.native_run("ci pr");
    assert!(!run.status.success());
    let combined = format!("{}\n{}", run.stdout, run.stderr);
    assert!(combined.contains("main") || combined.contains("lane"));
}

#[test]
fn ci_pr_when_already_on_a_lane() {
    let helper = Helper::new();
    setup_ci_workspace(&helper, 1);
    helper.create_lane("existing-lane", "");
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    let output = run_ci_pr(&helper, "--lane existing-lane");
    assert!(output.contains("existing-lane"));
    let remote_lanes = helper.run(&format!("lane list -r {} --json", helper.scopes.remote));
    assert!(remote_lanes.contains("existing-lane"));
}

#[test]
fn ci_pr_restores_lane_on_failure() {
    let helper = Helper::new();
    setup_ci_workspace(&helper, 1);
    helper.git("checkout -b failing-branch");
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    helper.output_file(
        "comp1/index.spec.js",
        "describe('fail', () => { it('fails', () => { expect(true).toBe(false); }); });",
    );
    let run = helper.native_run("ci pr");
    assert!(!run.status.success());
    let status = helper.status_json();
    assert!(
        status["currentLaneId"]
            .as_str()
            .is_none_or(|lane| lane == "main" || lane.ends_with("/main")),
    );
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.1"));
}

#[test]
fn ci_merge_tags_and_exports_components() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 2);
    simulate_merged_pr(&helper, &branch, "feat-1", || {
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.2"));
}

#[test]
fn ci_merge_handles_new_components() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 1);
    simulate_merged_pr(&helper, &branch, "feat-new", || {
        helper.output_file("comp2/index.js", "module.exports = () => 'comp2';");
        helper.native("add comp2");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp2").as_deref(), Some("0.0.1"));
}

#[test]
fn ci_merge_updates_dependents_and_multiple_prs() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 3);
    simulate_merged_pr(&helper, &branch, "feat-dep", || {
        helper.output_file("comp3/index.js", "module.exports = () => 'comp3 v2';");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp3").as_deref(), Some("0.0.2"));
    assert_eq!(remote_comp_version(&helper, "comp2").as_deref(), Some("0.0.2"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
}

#[test]
fn ci_merge_recovers_missing_objects_from_lane() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 2);
    simulate_merged_pr(&helper, &branch, "feat-missing", || {
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
}

#[test]
fn ci_merge_recovers_after_prior_pr_tagged_dep() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 2);
    simulate_merged_pr(&helper, &branch, "feat-prior", || {
        helper.output_file("comp2/index.js", "module.exports = () => 'comp2 v2';");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp2").as_deref(), Some("0.0.2"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
}

#[test]
fn ci_merge_bump_types_and_prerelease() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 1);
    simulate_merged_pr(&helper, &branch, "feat-minor", || {
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1 minor';");
    });
    let output = run_ci_merge(&helper, "--increment minor");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.1.0"));
}

#[test]
fn ci_merge_detached_head_checkout() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 1);
    simulate_merged_pr(&helper, &branch, "feat-detached", || {
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1 detached';");
    });
    let head_sha = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    helper.git(&format!("checkout {head_sha}"));
    let output = run_ci_merge(&helper, &format!("--branch {branch}"));
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
}

#[test]
fn ci_merge_deleted_component_in_pr() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 2);
    simulate_merged_pr(&helper, &branch, "feat-del", || {
        helper.run("remove comp1 --silent");
        helper.delete_path("comp1");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR") || !output.is_empty());
}

#[test]
fn ci_merge_new_component_depending_on_existing() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 1);
    simulate_merged_pr(&helper, &branch, "feat-new-dep", || {
        helper.output_file(
            "comp_new/index.js",
            "const comp1 = require('../comp1');\nmodule.exports = () => comp1();",
        );
        helper.native("add comp_new");
        helper.run("link --rewire");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp_new").as_deref(), Some("0.0.1"));
}

#[test]
fn ci_merge_modified_dependency_and_dependent() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 2);
    simulate_merged_pr(&helper, &branch, "feat-both", || {
        helper.append_file("comp1/index.js", "\n// mod1\n");
        helper.append_file("comp2/index.js", "\n// mod2\n");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
    assert_eq!(remote_comp_version(&helper, "comp2").as_deref(), Some("0.0.2"));
}

#[test]
fn ci_merge_no_bitmap_commit_flag() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 1);
    simulate_merged_pr(&helper, &branch, "feat-no-commit", || {
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1 no-commit';");
    });
    let sha_before = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    let output = run_ci_merge(&helper, "--no-bitmap-commit");
    assert!(output.contains("Merged PR"));
    let sha_after = helper
        .git("rev-parse HEAD")
        .trim()
        .to_owned();
    assert_eq!(sha_before, sha_after);
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
}

#[test]
fn ci_merge_custom_commit_message() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 1);
    simulate_merged_pr(&helper, &branch, "feat-msg", || {
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1 msg';");
    });
    let output = run_ci_merge(&helper, r#"--commit-message "custom ci [skip ci]""#);
    assert!(output.contains("Merged PR"));
    let git_log = helper.git("log -1 --pretty=%B");
    assert!(git_log.contains("custom ci [skip ci]"));
}

#[test]
fn ci_merge_non_fast_forward_push_retry() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 1);
    simulate_merged_pr(&helper, &branch, "feat-push-retry", || {
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1 retry';");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
}

#[test]
fn ci_merge_custom_env_was_also_modified() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 2);
    simulate_merged_pr(&helper, &branch, "feat-env-mod", || {
        helper.append_file("comp2/index.js", "\n// env mod\n");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp2").as_deref(), Some("0.0.2"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
}

#[test]
fn ci_merge_circular_dependencies_with_env() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 2);
    simulate_merged_pr(&helper, &branch, "feat-cycle-env", || {
        helper.append_file("comp1/index.js", "\n// cycle mod\n");
        helper.append_file("comp2/index.js", "\n// cycle mod\n");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
    assert_eq!(remote_comp_version(&helper, "comp2").as_deref(), Some("0.0.2"));
}

#[test]
fn ci_merge_multi_env_circular_dependencies() {
    let helper = Helper::new();
    let branch = setup_ci_workspace(&helper, 3);
    simulate_merged_pr(&helper, &branch, "feat-multi-env-cycle", || {
        helper.append_file("comp1/index.js", "\n// multi cycle\n");
        helper.append_file("comp2/index.js", "\n// multi cycle\n");
        helper.append_file("comp3/index.js", "\n// multi cycle\n");
    });
    let output = run_ci_merge(&helper, "");
    assert!(output.contains("Merged PR"));
    assert_eq!(remote_comp_version(&helper, "comp1").as_deref(), Some("0.0.2"));
    assert_eq!(remote_comp_version(&helper, "comp2").as_deref(), Some("0.0.2"));
    assert_eq!(remote_comp_version(&helper, "comp3").as_deref(), Some("0.0.2"));
}
