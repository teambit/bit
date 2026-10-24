//! `e2e/commands/remote.e2e.ts`.

use crate::helper::{Helper, Run, setup};
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

fn native_with_globals(helper: &Helper, globals: &Path, line: &str) -> String {
    let run = native_run_with_globals(helper, globals, line);
    assert!(
        run.status.success(),
        "`bit {line}` failed ({}):\n{}\n{}",
        run.status,
        run.stdout,
        run.stderr,
    );
    run.stdout
}

fn native_run_with_globals(helper: &Helper, globals: &Path, line: &str) -> Run {
    let run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        line,
        &[("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    assert!(run.native, "`bit {line}` ran on the Node.js CLI:\n{}", run.trace);
    run
}

/// adding a global remote › should be shown when running "bit remote"
/// adding a global remote › should be shown from any other workspace as well
/// adding a global remote › deleting remote › deleting a non-exist remote should throw an error
/// adding a global remote › deleting remote › deleting the global remote without "--global" flag should throw an error
/// adding a global remote › deleting remote › should successfully delete the global remote when "--global" flag was used
#[test]
fn adding_and_deleting_a_global_remote() {
    let helper = Helper::new();
    let globals = case_globals(&helper);
    helper.re_init_workspace();
    helper.re_init_remote_scope();
    let remote = &helper.scopes.remote;
    let remote_url = format!("file://{}", helper.scopes.remote_path.display());

    let added =
        native_with_globals(&helper, &globals, &format!("remote add {remote_url} --global"));
    assert!(added.contains("added remote scope"), "{added}");

    let listed = native_with_globals(&helper, &globals, "remote");
    assert!(listed.contains(remote), "{listed}");

    helper.re_init_workspace();
    let listed_other = native_with_globals(&helper, &globals, "remote");
    assert!(listed_other.contains(remote), "{listed_other}");

    helper.re_init_workspace();
    let non_exist = native_run_with_globals(&helper, &globals, "remote del non-exist-remote");
    assert!(!non_exist.status.success());
    let non_exist_err = format!("{}{}", non_exist.stdout, non_exist.stderr);
    assert!(
        non_exist_err.contains(r#"remote "non-exist-remote" was not found"#),
        "{non_exist_err}",
    );

    let without_global =
        native_run_with_globals(&helper, &globals, &format!("remote del {remote}"));
    assert!(!without_global.status.success());
    let without_global_err = format!("{}{}", without_global.stdout, without_global.stderr);
    assert!(
        without_global_err.contains(&format!(
            r#"remote "{remote}" was not found locally, to remove a global remote, please use "--global" flag"#,
        )),
        "{without_global_err}",
    );

    let removed = native_with_globals(&helper, &globals, &format!("remote del {remote} --global"));
    assert!(removed.contains("removed remote"), "{removed}");

    let after = native_with_globals(&helper, &globals, "remote");
    assert!(!after.contains(remote), "{after}");
}

/// adding a local remote › should be shown when running "bit remote"
/// adding a local remote › should not be shown from other workspace
/// adding a local remote › deleting remote › deleting the remote with "--global" flag should throw an error
/// adding a local remote › deleting remote › should successfully delete the remote when "--global" flag was not used
#[test]
fn adding_and_deleting_a_local_remote() {
    let helper = Helper::new();
    let globals = case_globals(&helper);
    helper.re_init_workspace();
    helper.re_init_remote_scope();
    let remote = &helper.scopes.remote;
    let remote_url = format!("file://{}", helper.scopes.remote_path.display());

    let added = native_with_globals(&helper, &globals, &format!("remote add {remote_url}"));
    assert!(added.contains("added remote scope"), "{added}");

    let listed = native_with_globals(&helper, &globals, "remote");
    assert!(listed.contains(remote), "{listed}");

    helper.re_init_workspace();
    let listed_other = native_with_globals(&helper, &globals, "remote");
    assert!(!listed_other.contains(remote), "{listed_other}");

    helper.re_init_workspace();
    native_with_globals(&helper, &globals, &format!("remote add {remote_url}"));

    let with_global =
        native_run_with_globals(&helper, &globals, &format!("remote del {remote} --global"));
    assert!(!with_global.status.success());
    let with_global_err = format!("{}{}", with_global.stdout, with_global.stderr);
    assert!(
        with_global_err.contains(&format!(
            r#"remote "{remote}" was not found globally, to remove a local remote, please omit the "--global" flag"#,
        )),
        "{with_global_err}",
    );

    let removed = native_with_globals(&helper, &globals, &format!("remote del {remote}"));
    assert!(removed.contains("removed remote"), "{removed}");

    let after = native_with_globals(&helper, &globals, "remote");
    assert!(!after.contains(remote), "{after}");
}

/// adding a non exist local remote with relative path › should throw `ScopeNotFound` error
#[test]
fn adding_non_exist_local_remote_with_relative_path_throws_scope_not_found() {
    let helper = Helper::new();
    let globals = case_globals(&helper);
    helper.re_init_workspace();
    let node_root = helper.clone_workspace();
    let command = "remote add file://non-exist-dir";
    let node = Helper::cmd_in_with(
        &node_root,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    let native = native_run_with_globals(&helper, &globals, command);
    assert!(!native.status.success());
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    let expected = format!(
        "error: scope not found at {}",
        helper.scopes.local_path.join("non-exist-dir").display(),
    );
    assert!(native.stderr.contains(&expected), "{}", native.stderr);
}
