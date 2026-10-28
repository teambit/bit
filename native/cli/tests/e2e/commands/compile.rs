//! Released compiler bytes, reports, caches and package links are compared at the same path.
use super::move_paths::support;

fn duration(output: &str) -> String {
    let marker = "Finished. (";
    let (before, after) = output.rsplit_once(marker).expect("compiler timing line");
    let (elapsed, after) = after.split_once(')').expect("compiler elapsed time");
    assert!(!elapsed.is_empty() && elapsed.chars().any(|character| character.is_ascii_digit()));
    format!("{before}{marker}<elapsed>){after}")
}

#[test]
fn builtin_compile_emitted_bytes_loader_caches_and_repeated_runs_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.js", "module.exports=()=>42;\n");
    let result = support::compare_with_stdout(&helper, "compile", duration);
    assert!(result.status.success());
    assert!(!result.trace.contains("starting the JavaScript host"));
    support::compare_with_stdout(&helper, "compile", duration);
    support::compare_with_stdout(&helper, "compile comp1 --verbose", duration);
    support::compare(&helper, "compile comp1 --json");
}

#[test]
fn builtin_compile_preserves_stale_files_until_delete_is_requested() {
    let helper = support::workspace(1, false);
    support::setup(&helper, "compile");
    let package = format!("node_modules/@{}/comp1/dist/stale.js", helper.scopes.remote);
    helper.output_file(&package, "module.exports=1;\n");
    support::compare_with_stdout(&helper, "compile", duration);
    assert!(helper.scopes.local_path.join(&package).exists());
    support::compare_with_stdout(&helper, "compile --delete-dist-dir", duration);
    assert!(!helper.scopes.local_path.join(&package).exists());
    helper.output_file(&package, "module.exports=2;\n");
    support::compare(&helper, "compile comp1 --json");
    assert!(!helper.scopes.local_path.join(&package).exists());
}

#[test]
fn builtin_compile_typescript_maps_and_diagnostics_match_node() {
    let helper = support::workspace(0, false);
    helper.output_file(
        "comp1/index.ts",
        "export interface Example { value: number }\nexport const value: number = 42;\n",
    );
    support::setup(&helper, "add comp1 -i comp1");
    support::compare(&helper, "compile comp1 --json");
    helper.output_file("comp1/index.ts", "export const value = ;\n");
    support::setup(&helper, "show comp1");
    let result = support::compare(&helper, "compile comp1 --json");
    assert!(result.status.success());
    let result = support::compare_with_stdout(&helper, "compile comp1", duration);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn builtin_compile_new_changed_empty_and_explicit_selection_match_node() {
    let helper = support::workspace(1, false);
    support::compare_with_stdout(&helper, "compile --changed", duration);
    support::compare_with_stdout(&helper, "compile comp1 --changed", duration);
    support::compare_with_stdout(&helper, "compile comp1 comp1", duration);
    let empty = support::workspace(0, false);
    support::compare_with_stdout(&empty, "compile", duration);
    support::compare_with_stdout(&empty, "compile --changed", duration);
    support::compare_declined(&empty, "compile --json", str::to_owned);
}

#[test]
fn builtin_compile_multiple_component_files_and_links_match_node() {
    let helper = support::workspace(3, true);
    helper.output_file("comp1/extra.js", "module.exports=()=>42;\n");
    support::compare_with_stdout(&helper, "compile", duration);
    support::compare_with_stdout(&helper, "compile", duration);
}

#[test]
fn builtin_compile_two_cold_components_json_report() {
    let helper = support::workspace(2, false);
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare(&helper, "compile comp1 comp2 --json");
    assert!(result.status.success());
}

#[test]
fn builtin_compile_two_cold_components_verbose_report() {
    let helper = support::workspace(2, false);
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "compile comp1 comp2 --verbose", duration);
    assert!(result.status.success());
}

#[test]
fn builtin_compile_two_cold_components_reverse_selection() {
    let helper = support::workspace(2, false);
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare(&helper, "compile comp2 comp1 --json");
    assert!(result.status.success());
}

#[test]
fn builtin_compile_two_cold_components_reverse_verbose() {
    let helper = support::workspace(2, false);
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare_with_stdout(&helper, "compile comp2 comp1 --verbose", duration);
    assert!(result.status.success());
}

#[test]
fn builtin_compile_two_cold_components_one_syntax_error() {
    let helper = support::workspace(0, false);
    helper.output_file("comp1/index.ts", "export const value: number = 42;\n");
    helper.output_file("comp2/index.ts", "export const value = ;\n");
    support::setup(&helper, "add comp1 -i comp1");
    support::setup(&helper, "add comp2 -i comp2");
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare(&helper, "compile comp2 comp1 --json");
    assert!(result.status.success());
}

#[test]
fn builtin_compile_two_components_one_syntax_error_text() {
    let helper = support::workspace(0, false);
    helper.output_file("comp1/index.ts", "export const value: number = 42;\n");
    helper.output_file("comp2/index.ts", "export const value = ;\n");
    support::setup(&helper, "add comp1 -i comp1");
    support::setup(&helper, "add comp2 -i comp2");
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    let result = support::compare_with_stdout(&helper, "compile comp1 comp2", duration);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn builtin_compile_two_cold_components_with_syntax_errors_json() {
    let helper = support::workspace(0, false);
    helper.output_file("comp1/index.ts", "export const first = ;\n");
    helper.output_file("comp2/index.ts", "export const second = ;\n");
    support::setup(&helper, "add comp1 -i comp1");
    support::setup(&helper, "add comp2 -i comp2");
    support::setup(&helper, "show comp1");
    support::setup(&helper, "show comp2");
    std::fs::remove_dir_all(bit_install::dependencies::cache::invalidation::deps_dir(
        &helper.scopes.local_path,
    ))
    .unwrap();
    let result = support::compare(&helper, "compile comp2 comp1 --json");
    assert!(result.status.success());
    let rows: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert!(
        rows.as_array()
            .unwrap()
            .iter()
            .all(|row| !row["errors"]
                .as_array()
                .unwrap()
                .is_empty()),
    );
}

#[test]
fn builtin_compile_rewired_sources_with_cold_documentation_cache_match_node() {
    let helper = support::workspace(2, true);
    helper.output_file(
        "comp1/index.js",
        "const value = require('../comp2'); console.log(value);\n",
    );
    helper.output_file("comp2/index.js", "console.log('value');\n");
    support::setup(&helper, "link --rewire");
    let cache = helper.scopes.local_path.join(".bit/cache/components/docs");
    std::fs::remove_dir_all(&cache).unwrap();
    let result = support::compare_with_stdout(&helper, "compile", duration);
    assert!(result.status.success());
    assert!(!result.trace.contains("starting the JavaScript host"));
}

#[test]
fn builtin_compile_copied_files_precede_transpiled_files_and_normalize_line_endings() {
    let helper = support::workspace(1, false);
    helper.output_file("comp1/aaa.js", "module.exports=42;\n");
    helper.output_file("comp1/copy.txt", "Example\r\nline\rnext\n");
    helper.output_file("comp1/types.d.ts", "export interface Example { value: number };\r\n");
    support::setup(&helper, "add comp1 -i comp1");
    support::compare(&helper, "compile comp1 --json");
    support::compare_with_stdout(&helper, "compile comp1 --verbose", duration);
}

#[test]
fn builtin_compile_react_tsx_and_ci_color_reports_match_node() {
    let helper = support::workspace(0, false);
    helper.output_file("comp1/index.tsx", "export const Example = () => <div>Hello</div>;\r\n");
    support::setup(&helper, "add comp1 -i comp1");
    let mut bitmap = helper.read_bit_map();
    bitmap["comp1"]["config"] = serde_json::json!({"teambit.react/react":{},"teambit.envs/envs":{"env":"teambit.react/react"}});
    helper.restore_bit_map(&serde_json::to_string_pretty(&bitmap).unwrap());
    support::setup(&helper, "show comp1");
    support::compare(&helper, "compile comp1 --json");
    super::add::support::compare_service_output(&helper, "compile comp1", duration, true, false);
    super::add::support::compare_service_output(
        &helper,
        "compile comp1 --verbose",
        duration,
        false,
        true,
    );
}

#[test]
fn builtin_compile_and_syntax_diagnostics_do_not_import_bit_modules() {
    use std::{ffi::OsStr, fs};
    let helper = support::workspace(0, false);
    helper.output_file("comp1/index.ts", "export const value: number = 42;\n");
    support::setup(&helper, "add comp1 -i comp1");
    let guard = helper.scopes.e2e_dir.join("reject-bit-modules.cjs");
    fs::write(&guard, r"const Module = require('node:module');
const load = Module._load;
Module._load = function (name, ...args) {
  if (name.includes('@teambit/') || name.includes('@teambit\\')) throw new Error('Bit module load forbidden');
  return load.call(this, name, ...args);
};").unwrap();
    let options = format!(r#"--require "{}""#, guard.to_string_lossy().replace('\\', "/"));
    for source in ["export const value: number = 43;\n", "export const value = ;\n"] {
        helper.output_file("comp1/index.ts", source);
        support::setup(&helper, "show comp1");
        let actual = crate::helper::Helper::cmd_in_with(
            &helper.scopes.local_path,
            "compile comp1 --json",
            &[("NODE_OPTIONS", OsStr::new(&options))],
        );
        assert!(actual.native && actual.status.success(), "{actual:?}");
        assert!(!actual.trace.contains("starting the JavaScript host"));
    }
}

#[cfg(unix)]
#[test]
fn builtin_compile_readonly_dist_failure_is_owned_without_replaying() {
    use std::{fs, os::unix::fs::PermissionsExt};
    let helper = support::workspace(1, false);
    support::setup(&helper, "compile");
    let path = helper.scopes.local_path.join(format!(
        "node_modules/@{}/comp1/dist/index.js",
        helper.scopes.remote,
    ));
    fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
    helper.output_file("comp1/index.js", "\nmodule.exports=()=>42;\n");
    let actual = support::compare_with_stdout(&helper, "compile", str::to_owned);
    assert_eq!(actual.status.code(), Some(1));
    super::add::support::compare_service_output(&helper, "compile", str::to_owned, true, false);
    super::add::support::compare_service_output(&helper, "compile", str::to_owned, false, true);
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.harmony/config-store",
        serde_json::json!({"concurrency.io":1}),
    );
    fs::write(path.with_extension("js.map"), "previous map").unwrap();
    support::compare_with_stdout(&helper, "compile", str::to_owned);
}

#[test]
fn builtin_compile_root_projects_receive_exact_dist_and_link_bytes() {
    let helper = support::workspace(1, false);
    for directory in ["z-root", "a-root"] {
        std::fs::create_dir_all(
            helper.scopes.local_path
                .join("node_modules/.bit_roots")
                .join(directory)
                .join("node_modules"),
        )
        .unwrap();
    }
    support::compare(&helper, "compile comp1 --json");
    support::compare_with_stdout(&helper, "compile comp1 --verbose", duration);
}

#[test]
fn builtin_compile_injected_packages_receive_exact_dist_and_manifest_bytes() {
    let helper = support::workspace(1, false);
    let package = format!("node_modules/@{}/comp1", helper.scopes.remote);
    helper.output_file(
        "node_modules/.modules.yaml",
        &serde_json::to_string(
            &serde_json::json!({"injectedDeps":{package:["injected/component"]}}),
        )
        .unwrap(),
    );
    support::compare(&helper, "compile comp1 --json");
    support::compare_with_stdout(&helper, "compile comp1 --verbose", duration);
}

#[test]
fn builtin_compile_optional_packages_and_peer_metadata_match_node() {
    let helper = support::workspace(1, true);
    support::setup(&helper, "deps set comp1 example-optional@1.0.0 --optional");
    support::setup(&helper, "deps set comp1 example-peer@1.0.0 --peer --optional");
    support::compare_with_stdout(&helper, "compile", duration);
    support::compare(&helper, "compile comp1 --json");
}

#[test]
fn builtin_compile_optional_component_metadata_matches_node() {
    let helper = support::workspace(2, true);
    let package = format!("@{}/comp2", helper.scopes.remote);
    helper.output_file("comp1/index.js", &format!("module.exports=require('{package}');\n"));
    support::setup(&helper, &format!("deps set comp1 {package}@0.0.1 --optional"));
    support::compare_with_stdout(&helper, "compile", duration);
    support::compare(&helper, "compile comp1 --json");
}
