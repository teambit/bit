//! Native linter orchestration compares released diagnostics and complete workspace/cache state.
use super::move_paths::support;

fn duration(output: &str) -> String {
    let mut value: serde_json::Value = serde_json::from_str(output).unwrap();
    assert_eq!(serde_json::to_string_pretty(&value).unwrap(), output);
    assert!(value["duration"]["elapsed"].as_u64().is_some());
    value["duration"]["elapsed"] = serde_json::json!(0);
    serde_json::to_string_pretty(&value).unwrap()
}

fn text_duration(output: &str) -> String {
    let (before, after) = output.rsplit_once(" components in ").unwrap();
    let (seconds, after) = after.split_once(" seconds").unwrap();
    let seconds: f64 = seconds.parse().unwrap();
    assert!(seconds.is_finite() && seconds >= 0.0);
    format!("{before} components in <duration> seconds{after}")
}

#[test]
fn standard_lint_clean_results_and_config_cache_match_without_bit_runtime() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    let result = support::compare_with_stdout(&helper, "lint --json", duration);
    assert!(result.status.success());
    assert!(!result.trace.contains("starting the JavaScript host"));
    support::compare_with_stdout(&helper, "lint --json", duration);
    support::compare_with_stdout(&helper, "lint", text_duration);
}

#[test]
fn standard_lint_warning_error_and_fix_preserve_released_diagnostics_and_sources() {
    let helper = support::workspace(1, true);
    for (source, command, code) in [
        ("const unused=42; module.exports=()=>42;\n", "lint --json", 0),
        ("module.exports=()=>missing;\n", "lint --json", 1),
        ("module.exports=()=>{return Boolean(!!true);};\n", "lint --fix --json", 0),
    ] {
        helper.output_file("comp1/index.js", source);
        support::setup(&helper, "show comp1");
        let result = support::compare_with_stdout(&helper, command, duration);
        assert_eq!(result.status.code(), Some(code));
        support::setup(&helper, "show comp1");
        support::compare_with_stdout(&helper, "lint", text_duration);
    }
}

#[test]
fn standard_lint_changed_new_empty_and_configured_workspace_names_match_node() {
    let helper = support::workspace(1, true);
    support::compare_with_stdout(&helper, "lint --changed --json", duration);
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    support::compare_with_stdout(&helper, "lint --changed --json", duration);
    support::compare_with_stdout(&helper, "lint comp1 --json", duration);
    let new = support::workspace(1, false);
    support::compare_with_stdout(&new, "lint --changed --json", duration);
    let empty = support::workspace(0, false);
    crate::helper::config::set_workspace_aspect_key(
        &empty.scopes.local_path,
        "name",
        serde_json::json!("Example workspace"),
    );
    support::compare_with_stdout(&empty, "lint --json", duration);
    support::compare_with_stdout(&empty, "lint", text_duration);
}

#[test]
fn standard_lint_ci_and_colored_diagnostics_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>missing;\n");
    support::setup(&helper, "show comp1");
    let remote = support::tree(&helper.scopes.remote_path);
    super::add::support::compare_service_output(&helper, "lint --json", duration, true, false);
    super::add::support::compare_service_output(&helper, "lint", text_duration, false, true);
    super::add::support::compare_service_output(&helper, "lint --json", duration, false, true);
    assert_eq!(support::tree(&helper.scopes.remote_path), remote);
}

#[cfg(unix)]
#[test]
fn standard_lint_readonly_fix_is_owned_and_preserves_service_error() {
    use std::{fs, os::unix::fs::PermissionsExt};
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>{return Boolean(!!true);};\n");
    support::setup(&helper, "show comp1");
    fs::set_permissions(
        helper.scopes.local_path.join("comp1/index.js"),
        fs::Permissions::from_mode(0o444),
    )
    .unwrap();
    let result = support::compare_with_stdout(&helper, "lint --fix --json", duration);
    assert!(result.status.success());
    support::compare_with_stdout(&helper, "lint --fix", text_duration);
}

#[test]
fn standard_lint_nested_sources_and_concurrent_fix_guard_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/nested/extra.js", "module.exports=()=>42;\n");
    support::compare_with_stdout(&helper, "lint --json", duration);
    support::compare_declined(&helper, "lint --fix --json", duration);
}

#[test]
fn standard_lint_uses_external_eslint_without_bit_module_imports() {
    use std::{ffi::OsStr, fs};
    let helper = support::workspace(1, true);
    let guard = helper.scopes.e2e_dir.join("reject-bit-modules.cjs");
    fs::write(&guard, r"const Module = require('node:module');
const load = Module._load;
Module._load = function (name, ...args) {
  if (name.includes('@teambit/') || name.includes('@teambit\\')) throw new Error('Bit module load forbidden');
  return load.call(this, name, ...args);
};").unwrap();
    let options = format!(r#"--require "{}""#, guard.to_string_lossy().replace('\\', "/"));
    let actual = crate::helper::Helper::cmd_in_with(
        &helper.scopes.local_path,
        "lint --json",
        &[("NODE_OPTIONS", OsStr::new(&options))],
    );
    assert!(actual.native && actual.status.success(), "{actual:?}");
    assert!(!actual.trace.contains("starting the JavaScript host"));
}

#[cfg(unix)]
#[test]
fn standard_lint_readonly_config_directory_returns_the_released_service_error() {
    use std::{fs, os::unix::fs::PermissionsExt};
    let helper = support::workspace(1, true);
    let directory = helper.scopes.local_path.join("node_modules/.cache");
    fs::create_dir_all(&directory).unwrap();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o555)).unwrap();
    support::compare_with_stdout(&helper, "lint --json", duration);
    support::compare_with_stdout(&helper, "lint", text_duration);
}

#[test]
fn standard_lint_noncanonical_config_cache_declines_without_rewriting_it() {
    use std::fs;
    let helper = support::workspace(1, true);
    support::setup(&helper, "lint --json");
    let directory = helper.scopes.local_path.join("node_modules/.cache");
    let config = fs::read_dir(directory)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("bit.tsconfig.eslint.")
        })
        .unwrap();
    fs::write(&config, "{\"compilerOptions\":{}}\n").unwrap();
    support::compare_declined(&helper, "lint --json", duration);
    assert_eq!(fs::read_to_string(config).unwrap(), "{\"compilerOptions\":{}}\n");
}
