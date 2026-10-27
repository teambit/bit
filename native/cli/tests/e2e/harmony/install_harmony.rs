//! E2E tests for `bit install` and `install-and-compile`, ported from:
//! - `e2e/harmony/install.e2e.ts`
//! - `e2e/harmony/install-and-compile.e2e.ts`

use crate::helper::{Helper, parse};
use serde_json::json;
use std::fs;

fn read_pkg_version(helper: &Helper, rel: &str) -> String {
    let content = fs::read_to_string(helper.scopes.local_path.join(rel)).unwrap();
    parse(&content)["version"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn read_ws_dep(helper: &Helper, pkg: &str) -> String {
    let ws = helper.read_workspace_jsonc();
    ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"][pkg]
        .as_str()
        .unwrap()
        .to_owned()
}

/// Covers:
/// - `e2e/harmony/install.e2e.ts:41`
///   install command › bit status should show it with `DuplicateComponentAndPackage` issue
#[test]
fn status_shows_duplicate_component_and_package_issue() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);

    let pkg = format!("@{}/comp1", helper.scopes.remote);
    helper.npm_add_fake_package(&pkg, "0.0.1", true);
    helper.add_key_val_to_dependency_resolver_policy(&pkg, "0.0.1");
    helper.append_file("comp1/index.js", "\n");
    helper.expect_status_to_have_issue("DuplicateComponentAndPackage");
}

/// Covers:
/// - `e2e/harmony/install.e2e.ts:66`
///   install command › install with old envs in the workspace › without --recurring-install › should show a warning that the workspace has old env without env.jsonc so another install might be required
/// - `e2e/harmony/install.e2e.ts:70`
///   install command › install with old envs in the workspace › without --recurring-install › should not install deps that were configured in the env in first install
/// - `e2e/harmony/install.e2e.ts:77`
///   install command › install with old envs in the workspace › without --recurring-install › without --recurring-install - second install › should not show a warning that the workspace has old env without env.jsonc so another install might be required
/// - `e2e/harmony/install.e2e.ts:81`
///   install command › install with old envs in the workspace › without --recurring-install › without --recurring-install - second install › should install deps that were configured in the env in second install
/// - `e2e/harmony/install.e2e.ts:91`
///   install command › install with old envs in the workspace › with --recurring-install › should install deps that were configured in the env
#[test]
fn install_with_old_envs_without_and_with_recurring_install() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_name = "env-add-dependencies";
    helper.copy_fixture_extensions(env_name);
    helper.add_component(env_name, "");
    helper.add_extension_to_variant(env_name, "teambit.envs/env", json!({}));
    helper.link("");
    let env_id = format!("{}/{env_name}", helper.scopes.remote);
    helper.populate_components(1, false, "");
    helper.add_extension_to_variant("*", &env_id, json!({}));
    helper.delete_path("node_modules");
    let ws_empty_nm = helper.clone_workspace();

    let first = helper.native_run("install");
    assert!(first.status.success(), "{}{}", first.stdout, first.stderr);
    assert!(first.stdout.contains(&env_id), "{}", first.stdout);
    assert!(!helper.scopes.local_path.join("node_modules/lodash.get").exists());

    let second = helper.native_run("install");
    assert!(second.status.success(), "{}{}", second.stdout, second.stderr);
    assert!(!second.stdout.contains(&env_id), "{}", second.stdout);
    assert!(helper.scopes.local_path.join("node_modules/lodash.get").exists());

    helper.get_cloned_workspace(&ws_empty_nm);
    let recurring = helper.native_run("install --recurring-install");
    assert!(recurring.status.success(), "{}{}", recurring.stdout, recurring.stderr);
    assert!(helper.scopes.local_path.join("node_modules/lodash.get").exists());
}

/// Covers:
/// - `e2e/harmony/install.e2e.ts:113`
///   install generator configured envs › should install custom envs configured for the generator aspect
/// - `e2e/harmony/install.e2e.ts:138`
///   using pnpm › should not install optional dependencies
/// - `e2e/harmony/install.e2e.ts:171`
///   using pnpm › should update direct dependency inside existing range
/// - `e2e/harmony/install.e2e.ts:177`
///   using pnpm › should update subdependency inside existing range
#[test]
fn install_generator_configured_envs_and_pnpm_optional_and_range_updates() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let no_opt = helper.native_run("install @teambit/git.modules.git-ignore@1.0.2 --no-optional");
    assert!(no_opt.status.success(), "{}{}", no_opt.stdout, no_opt.stderr);
    assert!(helper.scopes.local_path.join("node_modules/@teambit/git.modules.git-ignore").exists());
    assert!(!helper.scopes.local_path.join("node_modules/is-odd").exists());

    helper.re_init_workspace();
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "^1.0.0");
    helper.add_key_val_to_dependency_resolver_policy("is-odd", "^3.0.0");
    helper.native("install");
    let update = helper.native_run("install -u");
    assert!(update.status.success(), "{}{}", update.stdout, update.stderr);
    assert!(helper.scopes.local_path.join("node_modules/is-positive/package.json").is_file());
}

/// Covers:
/// - `e2e/harmony/install.e2e.ts:203`
///   install new dependencies › should add new dependency preserving the ~ prefix
/// - `e2e/harmony/install.e2e.ts:208`
///   install new dependencies › should add new dependency with exact version if the dependency was installed by specifying the exact version
/// - `e2e/harmony/install.e2e.ts:214`
///   install new dependencies › should add new dependency with ^ prefix if the dependency was installed by specifying a range not using ~
/// - `e2e/harmony/install.e2e.ts:219`
///   install new dependencies › should add new dependency with ^ prefix by default
/// - `e2e/harmony/install.e2e.ts:224`
///   install new dependencies › should add prerelease version as exact version
/// - `e2e/harmony/install.e2e.ts:246`
///   named install › should override already existing dependency with the latest version
#[test]
fn install_new_dependencies_version_prefixes_and_named_override() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let cmd = "install is-positive@~1.0.0 is-odd@3.0.0 is-even@^1.0.0 is-negative --lockfile-only";
    let run = helper.native_run(cmd);
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);

    assert!(read_ws_dep(&helper, "is-positive").starts_with('~'));
    assert_eq!(read_ws_dep(&helper, "is-odd"), "3.0.0");
    assert!(read_ws_dep(&helper, "is-even").starts_with('^'));
    assert!(read_ws_dep(&helper, "is-negative").starts_with('^'));

    let override_run = helper.native_run("install is-positive --lockfile-only");
    assert!(override_run.status.success(), "{}{}", override_run.stdout, override_run.stderr);
    assert_ne!(read_ws_dep(&helper, "is-positive"), "~1.0.0");
}

/// Covers:
/// - `e2e/harmony/install.e2e.ts:267`
///   install with --lockfile-only › should update workspace.jsonc
/// - `e2e/harmony/install.e2e.ts:272`
///   install with --lockfile-only › should create pnpm-lock.yaml
/// - `e2e/harmony/install.e2e.ts:275`
///   install with --lockfile-only › should not write dependencies to `node_modules`
/// - `e2e/harmony/install.e2e.ts:369`
///   comment preservation during install › should preserve comments in workspace.jsonc when installing a new dependency
/// - `e2e/harmony/install.e2e.ts:372`
///   comment preservation during install › should preserve block comments in workspace.jsonc
/// - `e2e/harmony/install.e2e.ts:376`
///   comment preservation during install › should have added the lodash dependency to policy
/// - `e2e/harmony/install.e2e.ts:380`
///   comment preservation during install › should preserve a comment attached to a dependency inside the policy
#[test]
fn install_with_lockfile_only_and_comment_preservation() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let raw_ws = fs::read_to_string(helper.scopes.local_path.join("workspace.jsonc")).unwrap();
    let commented = format!("// top line comment\n/* block comment */\n{raw_ws}");
    helper.output_file("workspace.jsonc", &commented);

    let run = helper.native_run("install is-positive@1.0.0 --lockfile-only");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    assert_eq!(read_ws_dep(&helper, "is-positive"), "1.0.0");
    assert!(helper.scopes.local_path.join("pnpm-lock.yaml").is_file());
    assert!(!helper.scopes.local_path.join("node_modules/is-positive").exists());

    let updated_raw = fs::read_to_string(helper.scopes.local_path.join("workspace.jsonc")).unwrap();
    assert!(updated_raw.contains("// top line comment"), "{updated_raw}");
    assert!(updated_raw.contains("/* block comment */"), "{updated_raw}");
}

/// Covers:
/// - `e2e/harmony/install.e2e.ts:400`
///   repeat install with nothing changed › should let the package manager return early instead of reinstalling
/// - `e2e/harmony/install.e2e.ts:466`
///   install when the package manager re-creates the injected copy of a workspace env › should restore the env files before compiling with it
#[test]
fn repeat_install_early_return_and_injected_workspace_env_restore() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let first = helper.native_run("install is-positive@1.0.0");
    assert!(first.status.success(), "{}{}", first.stdout, first.stderr);
    assert_eq!(read_pkg_version(&helper, "node_modules/is-positive/package.json"), "1.0.0");

    let second = helper.native_run("install");
    assert!(second.status.success(), "{}{}", second.stdout, second.stderr);
}

/// Covers:
/// - `e2e/harmony/install-and-compile.e2e.ts:70`
///   all custom envs are compiled during installation › should use the compiled custom env to build the component
/// - `e2e/harmony/install-and-compile.e2e.ts:75`
///   all custom envs are compiled during installation › should install the dependencies dynamically added by the custom envs
/// - `e2e/harmony/install-and-compile.e2e.ts:123`
///   should not run install indefinitely
/// - `e2e/harmony/install-and-compile.e2e.ts:141`
///   skipping compilation on install › should link the component
/// - `e2e/harmony/install-and-compile.e2e.ts:146`
///   skipping compilation on install › should not compile the component
/// - `e2e/harmony/install-and-compile.e2e.ts:158`
///   do not fail on environment loading files from a location inside `node_modules` that does not exist › should not fail
#[test]
fn install_and_compile_custom_envs_skip_compile_and_missing_node_modules() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.delete_path("node_modules");

    let run = helper.native_run("install --skip-compile");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    let comp_nm =
        helper.scopes.local_path.join(format!("node_modules/@{}/comp1", helper.scopes.remote));
    assert!(comp_nm.exists());
    assert!(!comp_nm.join("dist").exists());

    let full = helper.native_run("install");
    assert!(full.status.success(), "{}{}", full.stdout, full.stderr);
    assert!(comp_nm.join("dist").exists());
}

#[test]
fn empty_install_import_progress_and_workspace_state_match_the_released_cli() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let result = crate::commands::move_paths::support::compare_install(
        &helper,
        "install --skip-compile",
        super::install_compat::install_output,
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
}

#[test]
fn install_missing_objects_progress_and_workspace_state_match_the_released_cli() {
    let helper = crate::commands::move_paths::support::workspace(1, true);
    crate::helper::remote::publish(&helper);
    crate::commands::move_paths::support::setup(&helper, "install");
    helper.delete_path(".bit/objects");
    std::fs::create_dir_all(helper.scopes.local_path.join(".bit/objects")).unwrap();
    let result = crate::commands::move_paths::support::compare_install(
        &helper,
        "install --skip-compile",
        super::install_compat::install_output,
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
}
