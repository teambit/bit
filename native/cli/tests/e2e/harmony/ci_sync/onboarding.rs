//! Onboarding commands from `e2e/harmony/ci-sync-main.e2e.ts`.
mod native;
use super::support::{run_bit, setup_sync_workspace};
use crate::helper::{Helper, strip_ansi};
use std::{ffi::OsStr, fs};

#[test]
fn existing_uncommitted_scaffolding_is_staged_until_committed() {
    let helper = Helper::new();
    setup_sync_workspace(&helper, None);
    let (output, code) = run_bit(&helper, "bit ci sync --init");
    assert_eq!(code, 0, "{output}");
    let (output, code) = run_bit(&helper, "bit ci sync --init");
    assert_eq!(code, 0, "{output}");
    assert!(output.contains("git add -- .github/workflows/bit-sync.yml .github/workflows/bit-release.yml workspace.jsonc"));
    helper.git("add -A");
    helper.git("commit -m scaffold");
    let (output, code) = run_bit(&helper, "bit ci sync --init");
    assert_eq!(code, 0, "{output}");
    assert!(output.contains("nothing to commit"));
    assert!(!output.contains("git commit"));
    assert!(output.contains("git push -u origin HEAD"));
}

fn empty_repository() -> Helper {
    let helper = Helper::new();
    fs::create_dir_all(&helper.scopes.local_path).unwrap();
    helper.git("init");
    let result = helper.cmd("init --skip-interactive");
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    helper
}

#[test]
fn ignored_workflows_are_force_added_without_committing_unrelated_staged_files() {
    let helper = empty_repository();
    let ignore = helper.scopes.local_path.join(".gitignore");
    let mut contents = String::new();
    contents.push_str("\n.github/\n");
    fs::write(&ignore, contents).unwrap();
    helper.git("add -A");
    helper.git("commit -m workspace");
    helper.output_file("unrelated.txt", "staged before init\n");
    helper.git("add unrelated.txt");
    let (output, code) = run_bit(&helper, "bit ci sync --init");
    assert_eq!(code, 0, "{output}");
    assert!(output.contains("git add -- workspace.jsonc AGENTS.md"));
    let force_add = "add -f -- .github/workflows/bit-sync.yml .github/workflows/bit-release.yml";
    assert!(output.contains(&format!("git {force_add}")));
    assert!(output.contains(".gitignore matches these"));
    assert!(output.contains("git commit -m 'Mirror my-scope' -- \\\n"));
    assert!(output.contains(
        "workspace.jsonc AGENTS.md .github/workflows/bit-sync.yml .github/workflows/bit-release.yml"
    ));
    helper.git("add -- workspace.jsonc AGENTS.md");
    helper.git(force_add);
    helper.git("commit -m 'Mirror my-scope' -- workspace.jsonc AGENTS.md .github/workflows/bit-sync.yml .github/workflows/bit-release.yml");
    let committed = helper.git("show --name-only --format= HEAD");
    for file in [
        ".github/workflows/bit-sync.yml",
        ".github/workflows/bit-release.yml",
        "workspace.jsonc",
        "AGENTS.md",
    ] {
        assert!(committed.contains(file), "{committed}");
    }
    assert!(!committed.contains("unrelated.txt"));
    assert!(helper.git("diff --cached --name-only").contains("unrelated.txt"));
}

#[test]
fn ignored_workflows_are_force_added_before_the_first_commit() {
    let helper = empty_repository();
    let ignore = helper.scopes.local_path.join(".gitignore");
    let mut contents = String::new();
    contents.push_str("\n.github/\n");
    fs::write(ignore, contents).unwrap();
    let (output, code) = run_bit(&helper, "bit ci sync --init");
    assert_eq!(code, 0, "{output}");
    assert!(output.contains("git add -A\n"));
    let force_add = "add -f -- .github/workflows/bit-sync.yml .github/workflows/bit-release.yml";
    assert!(output.contains(&format!("git {force_add}")));
    helper.git("add -A");
    helper.git(force_add);
    let staged = helper.git("diff --cached --name-only");
    assert!(staged.contains(".github/workflows/bit-sync.yml"));
    assert!(staged.contains(".github/workflows/bit-release.yml"));
}

fn hosted_origin(origin: &str, server: &str, api: &str) -> (String, String) {
    let helper = empty_repository();
    helper.git(&format!("remote add origin {origin}"));
    helper.git("symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/trunk");
    let result = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "ci sync --init",
        &[("GITHUB_SERVER_URL", OsStr::new(server)), ("GITHUB_API_URL", OsStr::new(api))],
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    let workflow =
        fs::read_to_string(helper.scopes.local_path.join(".github/workflows/bit-sync.yml"))
            .unwrap();
    (strip_ansi(&result.stdout), workflow)
}

#[test]
fn github_origin_prints_repository_specific_onboarding_commands() {
    let (output, workflow) = hosted_origin(
        "https://github.com/example-org/example-project.git",
        "https://github.com",
        "https://api.github.com",
    );
    assert!(workflow.contains("branches-ignore: ['trunk', 'bit-sync/**']"));
    assert!(workflow.contains("# ws-dir: packages/my-workspace"));
    assert!(output.contains("mirrored to example-org/example-project (default branch: trunk)"));
    assert!(output.contains("Next: 3 steps to go live"));
    assert!(output.contains(
        "gh secret set BIT_CONFIG_ACCESS_TOKEN -R example-org/example-project"
    ));
    assert!(output.contains("gh secret set BIT_SYNC_GH_TOKEN -R example-org/example-project"));
    assert!(output.contains("https://github.com/apps/bit-git-sync"));
    assert!(!output.contains("/dispatches"));
}

#[test]
fn enterprise_origin_prints_server_api_dispatch_webhook() {
    let (output, _) = hosted_origin(
        "https://git.example.test/example-org/example-project.git",
        "https://git.example.test",
        "https://git.example.test/api/v3",
    );
    assert!(output.contains(
        "mirrored to git.example.test/example-org/example-project (default branch: trunk)"
    ));
    assert!(output.contains(
        "gh secret set BIT_CONFIG_ACCESS_TOKEN -R git.example.test/example-org/example-project"
    ));
    assert!(output.contains(
        "https://git.example.test/api/v3/repos/example-org/example-project/dispatches"
    ));
    assert!(output.contains("Authorization: Bearer"));
    assert!(output.contains("drops its custom headers"));
    assert!(!output.contains("github.com/apps/bit-git-sync"));
}
