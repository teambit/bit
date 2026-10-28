//! Built-in tester JSON compares command fields, source/scope bytes and loader caches.
use super::move_paths::support;
use serde_json::Value;

pub(super) fn timings(output: &str) -> String {
    let mut value: Value = serde_json::from_str(output).expect("tester JSON");
    for environment in value.as_array_mut().expect("tester environments") {
        for component in
            environment["data"]["components"].as_array_mut().expect("tested components")
        {
            component_timings(&mut component["results"]);
        }
    }
    serde_json::to_string_pretty(&value).unwrap()
}
fn component_timings(results: &mut Value) {
    assert!(
        results["start"]
            .as_u64()
            .is_some_and(|value| value > 0),
    );
    results["start"] = 0.into();
    for file in results["testFiles"].as_array_mut().expect("test files") {
        duration(&mut file["duration"]);
        for test in file["tests"].as_array_mut().expect("test assertions") {
            duration(&mut test["duration"]);
        }
    }
}
fn duration(value: &mut Value) {
    if value.is_null() {
        return;
    }
    assert!(value.as_u64().is_some(), "test duration: {value}");
    *value = 0.into();
}
#[test]
fn builtin_test_json_cold_docs_passing_pending_and_todo_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js","describe('Example',()=>{it('works',()=>expect(2+2).toBe(4));it.skip('later',()=>{});it.todo('future');});\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert!(result.status.success(), "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"));
    support::compare_with_stdout(&helper, "test comp1 --json", timings);
}
#[test]
fn builtin_test_json_failed_assertion_and_empty_test_body_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "describe('Example',()=>{it('works',()=>expect(2+2).toBe(5));});\n",
    );
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert_eq!(result.status.code(), Some(1));
    helper.output_file("comp1/index.spec.js", "const value=42;\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert_eq!(result.status.code(), Some(1));
}
#[test]
fn builtin_test_json_no_test_files_and_clean_selection_match_node() {
    let helper = support::workspace(1, true);
    support::compare(&helper, "test comp1 --json");
    support::compare(&helper, "test --json");
    support::compare(&helper, "test --unmodified --json");
}

#[test]
fn builtin_test_json_preserves_test_process_exit_code() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "afterAll(()=>{process.exitCode=7;});it('works',()=>expect(2+2).toBe(4));\n",
    );
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert_eq!(result.status.code(), Some(7));
}

#[test]
fn builtin_test_react_json_and_colored_ci_failures_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('works',()=>expect(2+2).toBe(4));\n");
    let mut bitmap = helper.read_bit_map();
    bitmap["comp1"]["config"] = serde_json::json!({"teambit.react/react":{},"teambit.envs/envs":{"env":"teambit.react/react"}});
    helper.restore_bit_map(&serde_json::to_string_pretty(&bitmap).unwrap());
    support::compare_with_stdout(&helper, "test comp1 --json", timings);
    helper.output_file("comp1/index.spec.js", "it('works',()=>expect(2+2).toBe(5));\n");
    super::add::support::compare_service_output(&helper, "test comp1 --json", timings, true, true);
}

#[test]
fn builtin_test_executes_without_bit_runtime_imports() {
    use std::{ffi::OsStr, fs};
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('works',()=>expect(2+2).toBe(4));\n");
    let guard = helper.scopes.e2e_dir.join("reject-bit-modules.cjs");
    fs::write(&guard,r"const Module=require('node:module');const load=Module._load;
Module._load=function(name,...args){if(name.includes('@teambit/')||name.includes('@teambit\\'))throw new Error('Bit module load forbidden');return load.call(this,name,...args);};").unwrap();
    let options = format!(r#"--require "{}""#, guard.to_string_lossy().replace('\\', "/"));
    let result = crate::helper::Helper::cmd_in_with(
        &helper.scopes.local_path,
        "test comp1 --json",
        &[("NODE_OPTIONS", OsStr::new(&options))],
    );
    assert!(result.native && result.status.success(), "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"));
    assert!(result.stderr.is_empty(), "{result:?}");
}

#[test]
fn builtin_test_snapshot_bytes_and_repeated_execution_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "it('snapshot',()=>expect({value:42}).toMatchSnapshot());\n",
    );
    support::compare_with_stdout(&helper, "test comp1 --json", timings);
    support::compare_with_stdout(&helper, "test comp1 --json", timings);
    helper.output_file(
        "comp1/index.spec.js",
        "it('snapshot',()=>expect({value:43}).toMatchSnapshot());\n",
    );
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn builtin_test_typescript_interfaces_and_cold_cache_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.ts","interface Example {value:number}; it('works',()=>{const item:Example={value:42}; expect(item.value).toBe(42);});\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert!(result.status.success(), "{result:?}");
}

#[test]
fn builtin_test_react_tsx_executes_the_actual_react_runtime() {
    let helper = support::workspace(1, true);
    let resolved=std::process::Command::new("node").arg("-e")
        .arg("process.stdout.write(require('node:module').createRequire(process.argv[1]).resolve('react/package.json'))")
        .arg(&crate::helper::setup::shared().node_cli).output().unwrap();
    assert!(resolved.status.success(), "{}", String::from_utf8_lossy(&resolved.stderr));
    let package = std::path::PathBuf::from(String::from_utf8(resolved.stdout).unwrap());
    crate::helper::setup::copy_dir(
        package.parent().unwrap(),
        &helper.scopes.local_path.join("node_modules/react"),
    );
    let mut bitmap = helper.read_bit_map();
    bitmap["comp1"]["config"] = serde_json::json!({"teambit.react/react":{},"teambit.envs/envs":{"env":"teambit.react/react"}});
    helper.restore_bit_map(&serde_json::to_string_pretty(&bitmap).unwrap());
    helper.output_file("comp1/index.spec.tsx","const Example=()=> <div>Hello</div>; it('works',()=>expect(Example().type).toBe('div'));\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert!(result.status.success(), "{result:?}");
}

#[test]
fn builtin_test_failure_owns_test_side_effects_without_replay() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js","const fs=require('fs'); afterAll(()=>{const path='test-side-effect';const value=fs.existsSync(path)?Number(fs.readFileSync(path,'utf8')):0;fs.writeFileSync(path,String(value+1));}); it('fails',()=>expect(2+2).toBe(5));\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "1",
    );
}

#[test]
fn builtin_test_unsupported_environment_selector_declines_before_running_tests() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js","const fs=require('fs'); it('works',()=>{const path='test-side-effect';const value=fs.existsSync(path)?Number(fs.readFileSync(path,'utf8')):0;fs.writeFileSync(path,String(value+1));expect(value).toBe(0);});\n");
    support::compare_declined(&helper, "test comp1 --env teambit.harmony/node --json", timings);
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "1",
    );
}

#[test]
fn builtin_test_process_exit_preserves_code_and_does_not_replay() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs'); it('exit',()=>{fs.appendFileSync('test-side-effect','x');process.exit(7);});\n");
    let result = support::compare(&helper, "test comp1 --json");
    assert_eq!(result.status.code(), Some(7));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
}

#[test]
fn builtin_test_unknown_negated_flags_preserve_released_errors() {
    for count in [0, 1] {
        let helper = support::workspace(count, false);
        for flag in [
            "--no-color",
            "--no-unmodified",
            "--no-watch",
            "--no-debug",
            "--no-coverage",
            "--no-update-snapshot",
            "--no-verbose",
            "--no-summary",
            "--no-all",
            "--no-json",
        ] {
            support::compare_declined(&helper, &format!("test comp1 --json {flag}"), str::to_owned);
        }
    }
}

#[test]
fn builtin_test_configured_negative_patterns_exclude_test_execution() {
    let helper = support::workspace(1, true);
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.defender/tester",
        serde_json::json!({"patterns":["**/*.spec.js", "!**/skip.spec.js"]}),
    );
    helper.output_file("comp1/index.spec.js", "it('works',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp1/skip.spec.js", "it('excluded',()=>expect(2+2).toBe(5));\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert!(result.status.success(), "{result:?}");
}

#[test]
fn builtin_test_multiple_files_use_jest_default_scheduling() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/first.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp1/second.spec.js", "it('second',()=>expect(2+2).toBe(4));\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", parallel_files);
    assert!(result.status.success(), "{result:?}");
}

// Same-path released-command replays produce both completion orders for these files.
fn parallel_files(output: &str) -> String {
    let mut value: Value = serde_json::from_str(&timings(output)).unwrap();
    let files = value[0]["data"]["components"][0]["results"]["testFiles"].as_array_mut().unwrap();
    let names: Vec<_> = files
        .iter()
        .map(|file| file["file"].as_str().unwrap())
        .collect();
    assert!(
        names == ["first.spec.js", "second.spec.js"]
            || names == ["second.spec.js", "first.spec.js"],
    );
    files.sort_by(|left, right| {
        left["file"]
            .as_str()
            .cmp(&right["file"].as_str())
    });
    serde_json::to_string_pretty(&value).unwrap()
}

#[test]
fn builtin_test_consumes_existing_coverage_and_retains_released_prefix_matching() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('works',()=>expect(2+2).toBe(4));\n");
    let metrics = coverage_metrics(3, 2, 66.67);
    let mut data = serde_json::json!({});
    for name in ["comp1/index.js", "comp1-other/extra.js"] {
        data[helper.scopes.local_path
            .join(name)
            .to_str()
            .unwrap()] = metrics.clone();
    }
    helper.output_file("coverage/coverage-summary.json", &serde_json::to_string(&data).unwrap());
    helper.output_file("coverage/existing-artifact", "artifact");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert!(result.status.success(), "{result:?}");
    assert!(!helper.scopes.local_path.join("coverage").exists());
}

#[test]
fn builtin_test_consumes_malformed_coverage_without_changing_test_results() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('works',()=>expect(2+2).toBe(4));\n");
    for source in ["not-json", "{}"] {
        helper.output_file("coverage/coverage-summary.json", source);
        helper.output_file("coverage/existing-artifact", "artifact");
        let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
        assert!(result.status.success(), "{result:?}");
        assert!(!helper.scopes.local_path.join("coverage").exists());
    }
    helper.output_file("coverage/preserved-artifact", "artifact");
    support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("coverage/preserved-artifact"))
            .unwrap(),
        "artifact",
    );
}

#[test]
fn builtin_test_consumes_coverage_created_by_the_test_once() {
    let helper = support::workspace(1, true);
    let metrics = serde_json::to_string(&coverage_metrics(3, 2, 66.67)).unwrap();
    helper.output_file("comp1/index.spec.js", &format!(
        "const fs=require('fs');const path=require('path');it('works',()=>{{fs.appendFileSync('test-side-effect','x');fs.mkdirSync('coverage',{{recursive:true}});fs.writeFileSync('coverage/coverage-summary.json',JSON.stringify({{[path.join(process.cwd(),'comp1/index.js')]:{metrics}}}));expect(2+2).toBe(4);}});\n",
    ));
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert!(result.status.success(), "{result:?}");
    assert!(!helper.scopes.local_path.join("coverage").exists());
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
}

#[cfg(unix)]
#[test]
fn builtin_test_coverage_cleanup_failure_returns_environment_error_without_replay() {
    use std::os::unix::fs::PermissionsExt;
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    helper.output_file("coverage/coverage-summary.json", "{}");
    let directory = helper.scopes.local_path.join("coverage");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = support::compare(&helper, "test comp1 --json");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
}

fn coverage_metrics(total: u64, covered: u64, pct: f64) -> Value {
    let mut result = serde_json::json!({});
    for name in ["lines", "functions", "statements", "branches"] {
        result[name] = serde_json::json!({"total":total,"covered":covered,"skipped":0,"pct":pct});
    }
    result
}

#[test]
fn builtin_test_preserves_the_in_band_process_arguments_and_working_directory() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('context',()=>{fs.writeFileSync('test-process.json',JSON.stringify({argv:process.argv,execArgv:process.execArgv,execPath:process.execPath,cwd:process.cwd(),nodeEnv:process.env.NODE_ENV}));});\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json", timings);
    assert!(result.status.success(), "{result:?}");
}
