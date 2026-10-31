//! `e2e/flows/remote-commands-outside-workspace.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, Run, parse, setup};
use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

fn case_globals(helper: &Helper) -> PathBuf {
    let globals = helper.scopes.e2e_dir.join("globals");
    fs::create_dir_all(globals.join("config")).unwrap();
    fs::copy(
        setup::shared().root.join("globals/config/config.json"),
        globals.join("config/config.json"),
    )
    .unwrap();
    globals
}

fn cmd_with_globals(helper: &Helper, globals: &Path, line: &str) -> Run {
    cmd_with_globals_and_env(helper, globals, line, &[])
}

fn cmd_with_globals_and_env(
    helper: &Helper,
    globals: &Path,
    line: &str,
    extra_env: &[(&str, &OsStr)],
) -> Run {
    let mut env = vec![("BIT_GLOBALS_DIR", globals.as_os_str())];
    env.extend_from_slice(extra_env);
    Helper::cmd_in_with(&helper.scopes.local_path, line, &env)
}

fn run_with_globals(helper: &Helper, globals: &Path, line: &str) -> String {
    let run = cmd_with_globals(helper, globals, line);
    assert!(
        run.status.success(),
        "`bit {line}` failed ({}):\n{}\n{}",
        run.status,
        run.stdout,
        run.stderr,
    );
    run.stdout
}

fn setup_outside_workspace() -> (Helper, PathBuf) {
    let helper = Helper::new();
    let globals = case_globals(&helper);
    helper.re_init_workspace();
    helper.re_init_remote_scope();
    let remote_url = format!("file://{}", helper.scopes.remote_path.display());
    run_with_globals(&helper, &globals, &format!("remote add {remote_url} --global"));
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    run_with_globals(&helper, &globals, "tag bar/foo --ignore-issues *");
    run_with_globals(&helper, &globals, "export");
    let _ = fs::remove_dir_all(&helper.scopes.local_path);
    fs::create_dir_all(&helper.scopes.local_path).unwrap();
    (helper, globals)
}

/// bit remote command › exporting a component to a global remote › bit status should throw an error `OutsideWorkspaceError`
#[test]
fn status_outside_workspace() {
    let (helper, globals) = setup_outside_workspace();
    let run = cmd_with_globals(&helper, &globals, "status");
    assert!(!run.status.success(), "expected status to fail outside workspace");
    let output = format!("{}{}", run.stdout, run.stderr);
    assert!(
        output.contains("only be run inside a bit workspace")
            || output.contains("unable to find a bit workspace")
            || output.contains("OutsideWorkspaceError"),
        "{output}",
    );
}

/// bit remote command › exporting a component to a global remote › bit list without --remote flag should throw an error `ConsumerNotFound`
#[test]
fn list_without_remote_flag_outside_workspace() {
    let (helper, globals) = setup_outside_workspace();
    let run = cmd_with_globals(&helper, &globals, "list");
    assert!(!run.status.success(), "expected list to fail outside workspace");
    let output = format!("{}{}", run.stdout, run.stderr);
    assert!(
        output.contains("workspace not found")
            || output.contains("ConsumerNotFound")
            || output.contains("not a workspace"),
        "{output}",
    );
}

/// bit remote command › exporting a component to a global remote › bit list with --remote flag should list the global remote successfully
#[test]
fn list_with_remote_flag_outside_workspace() {
    let (helper, globals) = setup_outside_workspace();
    let output = run_with_globals(&helper, &globals, &format!("list {}", helper.scopes.remote));
    assert!(output.contains("found 1 components"), "{output}");
}

/// bit remote command › exporting a component to a global remote › bit show --legacy should show the component and not throw an error about missing workspace
#[test]
fn show_legacy_remote_outside_workspace() {
    let (helper, globals) = setup_outside_workspace();
    let output = run_with_globals(
        &helper,
        &globals,
        &format!("show {}/bar/foo --legacy --remote", helper.scopes.remote),
    );
    assert!(output.contains("bar/foo"), "{output}");
}

/// bit remote command › exporting a component to a global remote › bit show without --legacy should throw a descriptive error
#[test]
fn show_without_legacy_remote_outside_workspace() {
    let (helper, globals) = setup_outside_workspace();
    let run = cmd_with_globals(
        &helper,
        &globals,
        &format!("show {}/bar/foo --remote", helper.scopes.remote),
    );
    assert!(!run.status.success());
    let output = format!("{}{}", run.stdout, run.stderr);
    assert!(
        output.contains("error: the current directory is not a workspace nor a scope"),
        "{output}",
    );
}

/// bit remote command › exporting a component to a global remote › bit remove with --remote flag › should not throw an error
#[test]
fn remove_with_remote_flag_outside_workspace_no_error() {
    let (helper, globals) = setup_outside_workspace();
    let hard_delete = OsStr::new("hard-delete");
    let run = cmd_with_globals_and_env(
        &helper,
        &globals,
        &format!("delete {}/bar/foo --silent --hard", helper.scopes.remote),
        &[("BIT_FEATURES", hard_delete)],
    );
    assert!(run.status.success(), "delete failed: {}\n{}", run.stdout, run.stderr);
    assert!(run.stdout.contains("successfully removed"), "{}", run.stdout);
}

/// bit remote command › exporting a component to a global remote › bit remove with --remote flag › should remove successfully
#[test]
fn remove_with_remote_flag_outside_workspace_removed() {
    let (helper, globals) = setup_outside_workspace();
    let hard_delete = OsStr::new("hard-delete");
    let run = cmd_with_globals_and_env(
        &helper,
        &globals,
        &format!("delete {}/bar/foo --silent --hard", helper.scopes.remote),
        &[("BIT_FEATURES", hard_delete)],
    );
    assert!(run.status.success(), "delete failed: {}\n{}", run.stdout, run.stderr);
    let output =
        run_with_globals(&helper, &globals, &format!("list {} --json", helper.scopes.remote));
    let list = parse(&output);
    assert_eq!(list.as_array().unwrap().len(), 0);
}
