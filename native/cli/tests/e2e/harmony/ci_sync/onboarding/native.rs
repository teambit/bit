//! Native onboarding compares complete command bytes and workspace/history state.
use crate::{commands::add::support, helper::Helper};
use std::{collections::BTreeMap, fs};

#[test]
fn initial_scaffolding_matches_node_and_writes_without_the_published_runtime() {
    let helper = super::empty_repository();
    let baseline = helper.clone_workspace();
    let compared = support::compare(&helper, "ci sync --init");
    assert!(compared.status.success(), "{compared:?}");
    assert!(!compared.trace.contains("starting the JavaScript host"));
    let expected = generated(&helper);
    helper.get_cloned_workspace(&baseline);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-runtime");
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "ci sync --init",
        &[("BIT_NODE_BINARY", unavailable.as_os_str()), ("BIT_NODE_CLI", unavailable.as_os_str())],
    );
    assert!(native.native && native.status.success(), "{native:?}");
    assert!(!native.trace.contains("starting the JavaScript host"));
    assert_eq!(generated(&helper), expected);
    let repeated = support::compare(&helper, "ci sync --init");
    assert!(repeated.status.success(), "{repeated:?}");
}

#[test]
fn onboarding_preserves_front_matter_comments_and_existing_workflows() {
    let helper = super::empty_repository();
    helper.output_file("AGENTS.md", "---\nkind: example\n---\n\n# Instructions\n\nKeep this introduction.\n\n## Existing rules\n\nKeep this content.\n");
    helper.output_file(".github/workflows/bit-sync.yml", "name: retained\n");
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let original = fs::read_to_string(&path).unwrap();
    fs::write(&path, format!("// retained configuration comment\n{original}")).unwrap();
    helper.git("remote add origin https://github.com/example-org/example-project.git");
    helper.git("symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/release/trunk");
    let result = support::compare(&helper, "ci sync --init");
    assert!(result.status.success(), "{result:?}");
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".github/workflows/bit-sync.yml")).unwrap(),
        b"name: retained\n",
    );
    let before = generated(&helper);
    let result = support::compare_ci(&helper, "ci sync --init", true);
    assert!(result.status.success(), "{result:?}");
    assert_eq!(generated(&helper), before);
}

#[test]
fn onboarding_keeps_unrelated_staged_changes_and_force_adds_only_ignored_outputs() {
    let helper = super::empty_repository();
    helper.output_file(".gitignore", ".github/\n");
    helper.git("add -A");
    helper.git("commit -m workspace");
    helper.output_file("unrelated.txt", "staged before onboarding\n");
    helper.git("add unrelated.txt");
    let staged = helper.git("diff --cached --binary");
    let result = support::compare(&helper, "ci sync --init");
    assert!(result.status.success(), "{result:?}");
    assert_eq!(helper.git("diff --cached --binary"), staged);
    assert!(result.stdout.contains("git add -f --"));
}

fn generated(helper: &Helper) -> BTreeMap<&'static str, Vec<u8>> {
    [
        ".github/workflows/bit-sync.yml",
        ".github/workflows/bit-release.yml",
        "AGENTS.md",
        "workspace.jsonc",
    ]
    .into_iter()
    .map(|path| (path, fs::read(helper.scopes.local_path.join(path)).unwrap()))
    .collect()
}

#[test]
fn onboarding_without_a_git_repository_matches_the_released_warning_and_state() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let result = support::compare(&helper, "ci sync --init");
    assert!(result.status.success(), "{result:?}");
    assert!(result.stdout.contains("could not resolve the git repository root"));
    assert!(!helper.scopes.local_path.join(".git").exists());
}

#[test]
fn nested_workspace_writes_workflows_at_the_repository_root_without_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    Helper::git_in(&helper.scopes.e2e_dir, "init");
    let baseline = helper.clone_workspace();
    let parent = helper.scopes.e2e_dir.join(".github");
    assert!(!parent.exists());
    let expected = nested_reference(&helper);
    assert!(expected.status.success(), "{expected:?}");
    let expected_files = nested_files(&helper);
    helper.get_cloned_workspace(&baseline);
    fs::remove_dir_all(&parent).unwrap();
    let unavailable = helper.scopes.e2e_dir.join("unavailable-runtime");
    let actual = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "ci sync --init",
        &[("BIT_NODE_BINARY", unavailable.as_os_str()), ("BIT_NODE_CLI", unavailable.as_os_str())],
    );
    assert!(actual.native && actual.status.success(), "{actual:?}");
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(
        nested_files(&helper),
        expected_files,
        "reference path trace: {}",
        fs::read_to_string(helper.scopes.e2e_dir.join("onboarding-paths.jsonl")).unwrap(),
    );
    assert!(!helper.scopes.local_path.join(".github").exists());
}

fn nested_reference(helper: &Helper) -> crate::helper::Run {
    let scripts = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let engine = scripts.join("../../scripts/rust/pnpm-oracle/preload.cjs");
    let trace = scripts.join("tests/e2e/harmony/ci_sync/onboarding/paths.cjs");
    let options = format!(
        r#"{} --require="{}" --require="{}""#,
        std::env::var("NODE_OPTIONS").unwrap_or_default(),
        engine.to_string_lossy().replace('\\', "/"),
        trace.to_string_lossy().replace('\\', "/"),
    );
    let log = helper.scopes.e2e_dir.join("onboarding-paths.jsonl");
    Helper::cmd_in_with(
        &helper.scopes.local_path,
        "ci sync --init",
        &[
            ("BIT_NATIVE", std::ffi::OsStr::new("off")),
            ("NODE_OPTIONS", std::ffi::OsStr::new(&options)),
            ("BIT_TEST_ONBOARDING_PATHS", log.as_os_str()),
        ],
    )
}

fn nested_files(helper: &Helper) -> BTreeMap<&'static str, Vec<u8>> {
    let mut files: BTreeMap<_, _> = ["AGENTS.md", "workspace.jsonc"]
        .into_iter()
        .map(|name| (name, fs::read(helper.scopes.local_path.join(name)).unwrap()))
        .collect();
    for name in ["bit-sync.yml", "bit-release.yml"] {
        files.insert(
            name,
            fs::read(helper.scopes.e2e_dir.join(".github/workflows").join(name)).unwrap(),
        );
    }
    files
}

#[test]
fn onboarding_filesystem_failures_keep_the_released_write_prefix_without_replay() {
    for blocker in [".github", "AGENTS.md"] {
        let helper = super::empty_repository();
        if blocker == ".github" {
            helper.output_file(blocker, "not a directory\n");
        } else {
            fs::create_dir(helper.scopes.local_path.join(blocker)).unwrap();
        }
        let result = support::compare(&helper, "ci sync --init");
        assert!(!result.status.success(), "{result:?}");
        assert!(!result.trace.contains("starting the JavaScript host"));
        if blocker == "AGENTS.md" {
            assert!(helper.scopes.local_path.join(".github/workflows/bit-sync.yml").is_file());
            assert!(helper.read_workspace_jsonc()["teambit.git/ci"]["sync"].is_object());
        }
    }
}

#[test]
fn onboarding_fills_the_repository_only_inside_existing_sync_instructions() {
    let helper = super::empty_repository();
    let initial = support::compare(&helper, "ci sync --init");
    assert!(initial.status.success(), "{initial:?}");
    helper.append_file("AGENTS.md", "\nUser text keeps <org>/<this-repo> unchanged.\n");
    helper.git("remote add origin git@github.com:example-org/example-project.git");
    helper.git(r#"symbolic-ref refs/remotes/origin/HEAD "refs/remotes/origin/release'candidate""#);
    let result = support::compare(&helper, "ci sync --init");
    assert!(result.status.success(), "{result:?}");
    let agents = fs::read_to_string(helper.scopes.local_path.join("AGENTS.md")).unwrap();
    assert!(agents.contains("example-org/example-project"));
    assert!(agents.contains("User text keeps <org>/<this-repo> unchanged."));
    assert!(result.stdout.contains("filled in the repository in the sync rules"));
}

#[test]
fn colored_enterprise_onboarding_matches_node_with_an_untrusted_api_url() {
    use std::ffi::OsStr;
    let helper = super::empty_repository();
    helper.git("remote add origin https://git.example/example-org/example-project.git");
    helper.git("symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/trunk");
    let baseline = helper.clone_workspace();
    let environment = [
        ("FORCE_COLOR", OsStr::new("1")),
        ("GITHUB_SERVER_URL", OsStr::new("https://git.example")),
        ("GITHUB_API_URL", OsStr::new("https://untrusted.example/api/v3")),
    ];
    let mut node_environment = environment.to_vec();
    node_environment.push(("BIT_NATIVE", OsStr::new("off")));
    let expected =
        Helper::cmd_in_with(&helper.scopes.local_path, "ci sync --init", &node_environment);
    assert!(expected.status.success(), "{expected:?}");
    let expected_files = generated(&helper);
    helper.get_cloned_workspace(&baseline);
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, "ci sync --init", &environment);
    assert!(actual.native && actual.status.success(), "{actual:?}");
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(generated(&helper), expected_files);
    assert!(actual.stdout.contains("refusing to send the token"));
}

#[test]
fn onboarding_a_nonempty_workspace_preserves_component_objects_and_package_links() {
    let helper = crate::commands::move_paths::support::workspace(1, true);
    helper.init_new_git_repo();
    let result = support::compare(&helper, "ci sync --init");
    assert!(result.status.success(), "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"));
}

#[test]
fn invalid_onboarding_configuration_delegates_before_any_scaffolding() {
    let helper = super::empty_repository();
    helper.output_file("workspace.jsonc", "{ invalid configuration\n");
    let result = support::compare_declined(&helper, "ci sync --init", str::to_owned);
    assert!(!result.status.success(), "{result:?}");
    assert!(!helper.scopes.local_path.join(".github").exists());
}

#[cfg(unix)]
#[test]
fn config_write_failure_keeps_the_completed_workflows_without_replaying() {
    use std::os::unix::fs::PermissionsExt;
    let helper = super::empty_repository();
    fs::set_permissions(
        helper.scopes.local_path.join("workspace.jsonc"),
        fs::Permissions::from_mode(0o444),
    )
    .unwrap();
    let result = support::compare(&helper, "ci sync --init");
    assert!(!result.status.success(), "{result:?}");
    assert!(helper.scopes.local_path.join(".github/workflows/bit-release.yml").is_file());
    assert!(!helper.read_workspace_jsonc()["teambit.git/ci"]["sync"].is_object());
}

#[test]
fn colored_onboarding_filesystem_failure_matches_both_released_error_styles() {
    use std::ffi::OsStr;
    let helper = super::empty_repository();
    helper.output_file(".github", "not a directory\n");
    let baseline = helper.clone_workspace();
    let expected = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "ci sync --init",
        &[("FORCE_COLOR", OsStr::new("1")), ("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(!expected.status.success(), "{expected:?}");
    helper.get_cloned_workspace(&baseline);
    let actual = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "ci sync --init",
        &[("FORCE_COLOR", OsStr::new("1"))],
    );
    assert!(actual.native && !actual.status.success(), "{actual:?}");
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
}
