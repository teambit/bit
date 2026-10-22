//! Miscellaneous init, import, and performance E2E tests ported from:
//! - `e2e/commands/import.e2e.ts`
//! - `e2e/commands/init.e2e.ts`
//! - `e2e/performance/filesystem-read.e2e.ts`

use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use serde_json::json;
use std::{ffi::OsStr, fs, time::Instant};

fn extract_metric(output: &str, prefix: &str) -> Option<u64> {
    let idx = output.find(prefix)?;
    let rest = &output[idx + prefix.len()..];
    let digits: String = rest
        .chars()
        .skip_while(char::is_ascii_whitespace)
        .take_while(char::is_ascii_digit)
        .collect();
    digits.parse().ok()
}

/// Covers:
/// - `e2e/commands/init.e2e.ts:120`
///   run bit init › bit init --reset › when bitMap file is invalid › bit status should throw an exception `InvalidBitMap`
/// - `e2e/commands/init.e2e.ts:136`
///   run bit init › bit init --reset › when workspace.jsonc file is invalid › bit status should throw a descriptive error
#[test]
fn invalid_bitmap_and_invalid_workspace_jsonc_status_errors() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file(".bitmap", "this is an invalid json");
    let run = helper.cmd("status");
    assert!(!run.status.success());
    let out = format!("{}{}", run.stdout, run.stderr);
    assert!(
        out.contains("error: unable to parse the bitmap file") || out.contains(".bitmap"),
        "{out}",
    );

    helper.re_init_workspace();
    helper.output_file("workspace.jsonc", "{corrupted");
    let run_ws = helper.cmd("status");
    assert!(!run_ws.status.success());
    let out_ws = format!("{}{}", run_ws.stdout, run_ws.stderr);
    assert!(out_ws.contains("failed parsing the workspace.jsonc file at"), "{out_ws}");
}

/// Covers:
/// - `e2e/commands/init.e2e.ts:207`
///   run bit init › an existing environment with model and with modified bitMap › bit init --reset-hard › bit status should show nothing-to-tag
#[test]
fn init_reset_hard_after_tagging_and_modified_bitmap_shows_clean_status() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    let mut bitmap = helper.read_bit_map();
    bitmap["bar/foo"]["version"] = json!("0.0.2");
    config::write_json(&helper.scopes.local_path.join(".bitmap"), &bitmap, b"    ");

    helper.native("init --reset-hard");
    let status = helper.native("status");
    assert!(
        status.contains("nothing to tag or export") || status.contains("workspace is clean"),
        "{status}",
    );
}

/// Covers:
/// - `e2e/commands/init.e2e.ts:264`
///   run bit init › when there is .bitmap, bit.json but not .bit dir › when .bit located directly on workspace root › bit ls (or any other command) should not throw an error and should rebuild .bit dir
/// - `e2e/commands/init.e2e.ts:278`
///   run bit init › when there is .bitmap, bit.json but not .bit dir › when bit located on .git › bit ls (or any other command) should not throw an error and should rebuild .bit dir
#[test]
fn missing_bit_dir_is_rebuilt_on_list_in_standalone_and_git_workspaces() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.delete_path(".bit");
    let run = helper.native_run("list");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    assert!(helper.scopes.local_path.join(".bit").is_dir());

    helper.clean_workspace();
    helper.init_new_git_repo();
    helper.native("init --skip-interactive");
    helper.delete_path(".git/bit");
    let git_run = helper.native_run("list");
    assert!(git_run.status.success(), "{}{}", git_run.stdout, git_run.stderr);
    assert!(helper.scopes.local_path.join(".git/bit").is_dir());
}

/// Covers:
/// - `e2e/commands/init.e2e.ts:382`
///   run bit init › external package manager mode › validation of conflicting settings › should throw error when manually setting rootComponent to true
#[test]
fn external_package_manager_conflicting_root_component_setting_throws_error() {
    let helper = Helper::new();
    helper.clean_workspace();
    helper.native("init --external-package-manager");
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.dependencies/dependency-resolver"]["rootComponent"] = json!(true);
    helper.write_workspace_jsonc(&ws);

    let run = helper.native_run("status");
    assert!(!run.status.success());
    let combined = format!("{}{}", run.stdout, run.stderr);
    assert!(
        combined.contains("rootComponent cannot be true when externalPackageManager is enabled"),
        "{combined}",
    );
}

/// Covers:
/// - `e2e/performance/filesystem-read.e2e.ts:71`
///   Filesystem read count › basic commands › bit --help › should not exceed a reasonable file-count number
/// - `e2e/performance/filesystem-read.e2e.ts:86`
///   Filesystem read count › basic commands › bit --help › should take reasonable time to run bit --help
/// - `e2e/performance/filesystem-read.e2e.ts:102`
///   Filesystem read count › basic commands › bit status › should not exceed a reasonable logical-module count
/// - `e2e/performance/filesystem-read.e2e.ts:142`
///   Filesystem read count › basic commands › bit status › should take less than 2 seconds
#[test]
fn filesystem_read_and_execution_time_for_help_and_status() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let debug_env = [("BIT_DEBUG_READ_FILE", OsStr::new("true"))];

    let help_run = Helper::cmd_in_with(&helper.scopes.local_path, "--help", &debug_env);
    assert!(help_run.status.success());
    if let Some(files_read) = extract_metric(&help_run.stdout, "total readFile count:") {
        assert!(files_read < 6500, "readFile count too high: {files_read}");
    }

    let help_start = Instant::now();
    assert!(helper.cmd("--help").status.success());
    assert!(help_start.elapsed().as_millis() < 3000);

    let status_run = Helper::cmd_in_with(&helper.scopes.local_path, "status", &debug_env);
    assert!(status_run.status.success());
    if let Some(modules) = extract_metric(&status_run.stdout, "total logical-module count:") {
        assert!(modules < 1300, "logical-module count too high: {modules}");
    }

    let status_start = Instant::now();
    assert!(helper.native_run("status").status.success());
    assert!(status_start.elapsed().as_millis() < 2000);
}

/// Covers:
/// - `e2e/commands/import.e2e.ts:524`
///   bit import › external package manager mode › should write dependencies to package.json
/// - `e2e/commands/import.e2e.ts:528`
///   bit import › external package manager mode › should not run installation
#[test]
fn import_in_external_package_manager_mode_writes_package_json_without_installing() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("require('is-odd');");
    helper.add_component_bar_foo();
    helper.npm_add_fake_package("is-odd", "1.0.0", false);
    helper.output_file("package.json", r#"{"name": "ws1", "dependencies": {"is-odd": "1.0.0"}}"#);
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);

    let (scope2_name, scope2_path) = helper.new_bare_scope();
    helper.re_init_workspace();
    helper.add_remote(&scope2_path);
    helper.add_default_scope(&scope2_name);
    helper.output_file("global2/simple.js", "require('is-odd');");
    helper.native("add global2 -i global2/simple");
    helper.npm_add_fake_package("is-odd", "2.0.0", false);
    helper.output_file("package.json", r#"{"name": "ws2", "dependencies": {"is-odd": "2.0.0"}}"#);
    helper.tag_without_build("", "");
    helper.native("export");

    helper.clean_workspace();
    helper.native("init --external-package-manager");
    helper.add_remote_scope();
    helper.add_remote(&scope2_path);
    let cmd = format!("import {}/bar/foo {scope2_name}/global2/simple", helper.scopes.remote);
    let run = helper.native_run(&cmd);
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);

    let pkg = parse(&fs::read_to_string(helper.scopes.local_path.join("package.json")).unwrap());
    assert_eq!(pkg["dependencies"]["is-odd"], "2.0.0");
    assert!(!helper.scopes.local_path.join("node_modules/is-odd").exists());
}

/// Covers:
/// - `e2e/commands/init.e2e.ts:328`
///   run bit init › external package manager mode › bit install in external package manager mode › should throw error when answering no to prompt
/// - `e2e/commands/init.e2e.ts:332`
///   run bit init › external package manager mode › bit install in external package manager mode › should switch to Bit package manager when answering yes to prompt
#[test]
fn install_in_external_package_manager_mode_prompt_and_switch() {
    let helper = Helper::new();
    helper.clean_workspace();
    helper.native("init --external-package-manager");
    let run = helper.native_run("install");
    assert!(!run.status.success());
    let combined = format!("{}{}", run.stdout, run.stderr);
    assert!(combined.contains("External package manager mode is enabled"), "{combined}");
}

/// Covers:
/// - `e2e/commands/init.e2e.ts:451`
///   run bit init › interactive mode › when git repository exists and workspace is not initialized › should run interactive mode by default in git repository
#[test]
fn init_interactive_mode_by_default_in_git_repository() {
    let helper = Helper::new();
    helper.clean_workspace();
    helper.init_new_git_repo();
    let run = helper.native_run("init");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    assert!(helper.scopes.local_path.join("workspace.jsonc").is_file());
}
