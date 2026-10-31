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
fn standard_lint_multiple_components_share_config_and_preserve_reports() {
    let helper = support::workspace(2, false);
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    helper.output_file("comp2/index.js", "module.exports=()=>missing;\n");
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "lint --json", duration);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn standard_lint_multiple_new_typescript_components() {
    let helper = support::workspace(2, false);
    helper.output_file("comp1/index.ts", "export const value: number = 42;\n");
    helper.output_file("comp2/index.ts", "export const value: number = 7;\n");
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    support::compare_with_stdout(&helper, "lint --json", duration);
}

#[test]
fn standard_lint_multiple_components_cold_text() {
    let helper = support::workspace(2, false);
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "lint", text_duration);
    assert!(result.status.success());
}

#[test]
fn standard_lint_fixes_two_single_file_components_in_order() {
    let helper = support::workspace(2, false);
    helper.output_file("comp1/index.js", "module.exports=()=>{return Boolean(!!true);};\n");
    helper.output_file("comp2/index.js", "module.exports=()=>{return Boolean(!!false);};\n");
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "lint --fix --json", duration);
    assert!(result.status.success());
    for name in ["comp1", "comp2"] {
        let source =
            std::fs::read_to_string(helper.scopes.local_path.join(name).join("index.js")).unwrap();
        assert!(!source.contains("!!"), "{name}: {source}");
    }
}

#[test]
fn standard_lint_three_cold_components_share_config() {
    let helper = support::workspace(3, false);
    for index in 1..=3 {
        helper.output_file(
            &format!("comp{index}/index.js"),
            &format!("module.exports=()=>{index};\n"),
        );
        support::setup(&helper, &format!("show comp{index}"));
    }
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "lint --json", duration);
    assert!(result.status.success());
}

#[test]
fn standard_lint_fixes_three_cold_single_file_components() {
    let helper = support::workspace(3, false);
    for index in 1..=3 {
        helper.output_file(
            &format!("comp{index}/index.js"),
            "module.exports=()=>{return Boolean(!!true);};\n",
        );
        support::setup(&helper, &format!("show comp{index}"));
    }
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "lint --fix --json", duration);
    assert!(result.status.success());
    for index in 1..=3 {
        let source =
            std::fs::read_to_string(helper.scopes.local_path.join(format!("comp{index}/index.js")))
                .unwrap();
        assert!(!source.contains("!!"), "{source}");
    }
}

#[test]
fn standard_lint_eight_cold_components_share_config() {
    let helper = support::workspace(8, false);
    for index in 1..=8 {
        support::setup(&helper, &format!("show comp{index}"));
    }
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "lint --json", duration);
    assert!(result.status.success());
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
    support::compare_with_stdout(&helper, "lint --fix --json", duration);
}

#[test]
fn standard_lint_multiple_sources_with_one_fix_uses_existing_config() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>{return Boolean(!!true);};\n");
    helper.output_file("comp1/extra.js", "module.exports = () => 42;\n");
    support::setup(&helper, "show comp1");
    assert_eq!(
        super::add::support::node(&helper.scopes.local_path, "lint --json")
            .status
            .code(),
        Some(1),
    );
    let result = support::compare_with_stdout(&helper, "lint --fix --json", duration);
    assert!(result.status.success());
    assert!(
        !std::fs::read_to_string(helper.scopes.local_path.join("comp1/index.js"))
            .unwrap()
            .contains("!!"),
    );
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("comp1/extra.js")).unwrap(),
        "module.exports = () => 42;\n",
    );
}

#[test]
fn standard_lint_multiple_multi_source_components_with_one_fix_each_uses_existing_config() {
    let helper = support::workspace(2, false);
    for (index, boolean) in [(1, "true"), (2, "false")] {
        helper.output_file(
            &format!("comp{index}/index.js"),
            &format!("module.exports=()=>{{return Boolean(!!{boolean});}};\n"),
        );
        helper.output_file(&format!("comp{index}/extra.js"), "module.exports = () => 42;\n");
        support::setup(&helper, &format!("show comp{index}"));
    }
    assert_eq!(
        super::add::support::node(&helper.scopes.local_path, "lint --json")
            .status
            .code(),
        Some(1),
    );
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "lint --fix --json", duration);
    assert!(result.status.success());
    for name in ["comp1", "comp2"] {
        assert!(
            !std::fs::read_to_string(helper.scopes.local_path.join(name).join("index.js"))
                .unwrap()
                .contains("!!"),
        );
    }
}

#[test]
fn standard_lint_multiple_simultaneous_fixes_remain_guarded() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>{return Boolean(!!true);};\n");
    helper.output_file("comp1/extra.js", "module.exports=()=>{return Boolean(!!false);};\n");
    support::setup(&helper, "show comp1");
    assert_eq!(
        super::add::support::node(&helper.scopes.local_path, "lint --json")
            .status
            .code(),
        Some(1),
    );
    let result = support::compare_with_stdout(&helper, "lint --fix --json", duration);
    assert!(result.status.success());
    for file in ["comp1/index.js", "comp1/extra.js"] {
        assert!(
            !std::fs::read_to_string(helper.scopes.local_path.join(file)).unwrap().contains("!!"),
        );
    }
}

#[cfg(unix)]
#[test]
fn standard_lint_multiple_sources_with_one_readonly_fix() {
    use std::os::unix::fs::PermissionsExt;
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>{return Boolean(!!true);};\n");
    helper.output_file("comp1/extra.js", "module.exports = () => 42;\n");
    support::setup(&helper, "show comp1");
    assert_eq!(
        super::add::support::node(&helper.scopes.local_path, "lint --json")
            .status
            .code(),
        Some(1),
    );
    let path = helper.scopes.local_path.join("comp1/index.js");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o444)).unwrap();
    let result = support::compare_with_stdout(&helper, "lint --fix", text_duration);
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert!(result.status.success());
    assert!(std::fs::read_to_string(&path).unwrap().contains("!!"));
}

#[test]
fn standard_lint_uses_external_eslint_without_bit_module_imports() {
    assert_no_bit_modules(false);
}

#[test]
fn builtin_react_lint_uses_external_eslint_without_bit_module_imports() {
    assert_no_bit_modules(true);
}

fn assert_no_bit_modules(react: bool) {
    use std::{ffi::OsStr, fs};
    let helper = support::workspace(1, true);
    if react {
        support::setup(&helper, "env set comp1 teambit.react/react");
    }
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

#[test]
fn builtin_react_lint_matches_released_loading_and_cached_state_without_host() {
    let helper = support::workspace(1, true);
    support::setup(&helper, "env set comp1 teambit.react/react");
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    for command in ["lint --json", "lint --changed --json", "lint comp1 --json"] {
        let result = support::compare_with_stdout(&helper, command, duration);
        assert!(result.status.success());
        assert!(!result.trace.contains("starting the JavaScript host"));
    }
    support::compare_with_stdout(&helper, "lint", text_duration);
}

#[test]
fn builtin_react_lint_dependency_policy_diagnostics_and_fixes_match_node() {
    let helper = support::workspace(1, true);
    support::setup(&helper, "env set comp1 teambit.react/react");
    helper.npm_add_fake_package("react", "19.0.0", false);
    helper.output_file("node_modules/react/index.js", "module.exports={};\n");
    for (source, command) in [
        ("const React=require('react'); module.exports=()=>React;\n", "lint --json"),
        ("module.exports=()=>missing;\n", "lint --json"),
        ("module.exports=()=>Boolean(!!true);\n", "lint --fix --json"),
    ] {
        helper.output_file("comp1/index.js", source);
        support::setup(&helper, "show comp1");
        let result = support::compare_with_stdout(&helper, command, duration);
        assert!(!result.trace.contains("starting the JavaScript host"));
    }
    support::setup(&helper, "show comp1");
    super::add::support::compare_service_output(&helper, "lint", text_duration, false, true);
    super::add::support::compare_service_output(&helper, "lint --json", duration, true, false);
}

#[cfg(unix)]
#[test]
fn builtin_react_lint_write_failure_reports_its_environment_without_replay() {
    use std::{fs, os::unix::fs::PermissionsExt};
    let helper = support::workspace(1, true);
    support::setup(&helper, "env set comp1 teambit.react/react");
    helper.output_file("comp1/index.js", "module.exports=()=>Boolean(!!true);\n");
    support::setup(&helper, "show comp1");
    fs::set_permissions(
        helper.scopes.local_path.join("comp1/index.js"),
        fs::Permissions::from_mode(0o444),
    )
    .unwrap();
    support::compare_with_stdout(&helper, "lint --fix --json", duration);
    support::compare_with_stdout(&helper, "lint --fix", text_duration);
}

#[test]
fn builtin_react_lint_changed_selection_preserves_tagged_peer_policy() {
    let helper = support::workspace(1, false);
    support::setup(&helper, "env set comp1 teambit.react/react");
    helper.npm_add_fake_package("react", "19.0.0", false);
    helper.output_file("node_modules/react/index.js", "module.exports={};\n");
    helper.output_file(
        "comp1/index.js",
        "const React=require('react'); module.exports=()=>React;\n",
    );
    support::tag(&helper);
    let result = support::compare_with_stdout(&helper, "lint --changed --json", duration);
    let value: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(value["componentsIdsToLint"], serde_json::json!([]));
}
