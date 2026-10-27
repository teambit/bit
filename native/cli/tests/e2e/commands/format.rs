//! Formatting checks compare the released command, full caches and the untouched remote.
use super::move_paths::support;
#[test]
fn standard_format_checks_match_json_and_component_loading_without_a_bit_host() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>{return \"format me\"};\n");
    let result = support::compare(&helper, "format --check --json");
    assert_eq!(result.status.code(), Some(1));
    assert!(!result.trace.contains("starting the JavaScript host"), "{result:?}");
    support::setup(&helper, "export");
    support::compare(&helper, "format --check --json");
}

#[test]
fn standard_format_checks_clean_and_new_components_and_selection_match_node() {
    let helper = support::workspace(2, false);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';\n");
    std::fs::remove_dir_all(helper.scopes.local_path.join(".bit/cache/components/deps")).unwrap();
    let all = support::compare(&helper, "format '**/comp*' --check --json");
    assert_eq!(all.status.code(), Some(1));
    assert!(!all.trace.contains("starting the JavaScript host"));
    let clean = support::compare(&helper, "format comp1 --check --json");
    assert!(clean.status.success());
    support::compare_with_stdout(&helper, "format --changed --check --json", two_component_order);
    support::compare_with_stdout(&helper, "format '**/comp*' --check --json", two_component_order);
}

#[test]
fn standard_format_check_text_and_ci_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    support::compare_with_stdout(&helper, "format --check", duration);
    support::compare_ci(&helper, "format --check --json", true);
}

fn duration(output: &str) -> String {
    let Some((before, after)) = output.rsplit_once(" components in ") else {
        return output.to_owned();
    };
    let (seconds, after) = after.split_once("s.").unwrap();
    let seconds: f64 = seconds.parse().unwrap();
    assert!(seconds.is_finite() && seconds >= 0.0);
    format!("{before} components in <duration>s.{after}")
}

#[test]
fn standard_format_writes_match_json_text_and_repeated_clean_results() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    assert!(support::compare(&helper, "format --json").status.success());
    assert!(support::compare(&helper, "format --check --json").status.success());
    helper.output_file("comp1/index.js", "module.exports=()=>43;\n");
    assert!(support::compare_with_stdout(&helper, "format", duration).status.success());
}

#[cfg(unix)]
#[test]
fn standard_format_readonly_source_returns_owned_json_error_without_replay() {
    use std::{fs, os::unix::fs::PermissionsExt};
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    let path = helper.scopes.local_path.join("comp1/index.js");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
    let actual = support::compare(&helper, "format --json");
    assert!(actual.status.success());
    let json: serde_json::Value = serde_json::from_str(&actual.stdout).unwrap();
    assert_eq!(json["errors"][0]["code"], "EACCES");
    support::compare_with_stdout(&helper, "format", duration);
}

#[test]
fn standard_format_changed_selection_matches_clean_and_modified_components() {
    let helper = support::workspace(1, true);
    support::compare(&helper, "format --changed --check --json");
    support::compare_with_stdout(&helper, "format --changed --check", duration);
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    support::compare(&helper, "format --changed --check --json");
    support::compare_with_stdout(&helper, "format --changed --check", duration);
    support::compare(&helper, "format --changed --json");
}

#[test]
fn standard_format_uses_prettier_without_loading_bit_runtime_modules() {
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
        "format --check --json",
        &[("NODE_OPTIONS", OsStr::new(&options))],
    );
    assert!(actual.native, "{actual:?}");
    assert_eq!(actual.status.code(), Some(1), "{actual:?}");
    assert!(!actual.trace.contains("starting the JavaScript host"));
}

#[test]
fn standard_format_empty_workspace_and_configured_name_match_node() {
    let helper = support::workspace(0, false);
    helper.add_key_val_to_workspace("name", serde_json::json!("Example workspace"));
    support::compare(&helper, "format --check --json");
    support::compare_with_stdout(&helper, "format", duration);
}

#[test]
fn standard_format_nested_source_checks_preserve_file_order_and_guard_concurrent_writes() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/aaa/extra.js", "module.exports=()=>42;\n");
    helper.output_file("comp1/z.js", "module.exports=()=>true;\n");
    support::compare(&helper, "format --check --json");
    support::compare_declined(&helper, "format --json", str::to_owned);
}

#[test]
fn standard_format_ignored_extensions_delegate_before_cache_or_source_writes() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/schema.graphql", "type Example { field: String }\n");
    support::compare_declined(&helper, "format --check --json", str::to_owned);
}

// Released Node-to-Node replay produces both complete permutations on the same cached fixture.
fn two_component_order(output: &str) -> String {
    let mut value: serde_json::Value = serde_json::from_str(output).unwrap();
    assert_eq!(serde_json::to_string_pretty(&value).unwrap(), output);
    let rows = value["results"].as_array_mut().unwrap();
    assert_eq!(rows.len(), 2);
    rows.sort_by_key(|row| {
        row["componentId"]["_legacy"]["name"]
            .as_str()
            .unwrap()
            .to_owned()
    });
    assert_eq!(rows[0]["componentId"]["_legacy"]["name"], "comp1");
    assert_eq!(rows[1]["componentId"]["_legacy"]["name"], "comp2");
    serde_json::to_string_pretty(&value).unwrap()
}

#[test]
fn builtin_react_format_matches_released_loading_and_cached_state_without_host() {
    let helper = support::workspace(1, true);
    support::setup(&helper, "env set comp1 teambit.react/react");
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    for command in ["format --check --json", "format --json", "format --check --json"] {
        let result = support::compare(&helper, command);
        assert!(!result.trace.contains("starting the JavaScript host"));
    }
}

#[cfg(unix)]
#[test]
fn builtin_react_format_write_failure_reports_its_environment_without_replay() {
    use std::{fs, os::unix::fs::PermissionsExt};
    let helper = support::workspace(1, true);
    support::setup(&helper, "env set comp1 teambit.react/react");
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    fs::set_permissions(
        helper.scopes.local_path.join("comp1/index.js"),
        fs::Permissions::from_mode(0o444),
    )
    .unwrap();
    support::compare(&helper, "format --json");
    support::compare_with_stdout(&helper, "format", duration);
}

#[test]
fn builtin_react_format_keeps_mixed_environment_groups_on_released_runner() {
    let helper = support::workspace(2, true);
    support::setup(&helper, "env set comp1 teambit.react/react");
    support::compare_declined(&helper, "format --check --json", str::to_owned);
}
