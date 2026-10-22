//! Cases from:
//! - `e2e/harmony/jest.e2e.ts`
//! - `e2e/harmony/mocha-tester.e2e.ts`
//! - `e2e/harmony/mocha-tester-spec-files.e2e.ts`
//! - `e2e/harmony/multiple-testers.e2e.ts`

use crate::helper::{Helper, Run, config, setup};
use serde_json::json;
use std::{fs, path::PathBuf};

const PASSING_JEST_SPEC: &str = "describe('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n});\n";
const FAILING_JEST_SPEC: &str = "describe('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n  it('should fail', () => {\n    expect(true).toBe(false);\n  });\n});\n";
const ERRORED_JEST_SPEC: &str = "throw new Error('some-err');\ndescribe('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n});\n";
const DESCRIBE_ONLY_SPEC: &str = "describe.only('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n});\n";
const PASSING_MOCHA_SPEC: &str = "import { expect } from 'chai';\ndescribe('comp1', () => {\n  it('should pass', () => {\n    expect(true).to.be.true;\n  });\n});\n";
const FAILING_MOCHA_SPEC: &str = "import { expect } from 'chai';\ndescribe('comp1', () => {\n  it('should fail', () => {\n    expect(true).to.be.false;\n  });\n});\n";
const ERRORED_MOCHA_SPEC: &str = "import { expect } from 'chai';\ndescribe('comp1', () => {\n  throw new Error('SomeError');\n  it('should not reach here', () => {\n    expect(true).to.be.true;\n  });\n});\n";
const MOCHA_PKGS: &[&str] = &[
    "@teambit/typescript.typescript-compiler",
    "@teambit/defender.mocha-tester",
    "chai@^4.3.7",
    "chai-fs",
    "@babel/preset-typescript",
    "@babel/preset-env",
];
const JEST_ENV_PKGS: &[&str] = &[
    "@teambit/react.react-env",
    "@teambit/typescript.typescript-compiler",
    "@teambit/defender.jest-tester",
    "@teambit/defender.testers.multi-tester",
];

fn copy_fixture_ext_recursive(helper: &Helper, dir: &str) {
    let src = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../components/legacy/e2e-helper/excluded-fixtures/extensions")
        .join(dir);
    let dst = helper.scopes.local_path.join(dir);
    setup::copy_dir(&src, &dst);
    for entry in fs::read_dir(&dst).unwrap() {
        let path = entry.unwrap().path();
        if path.is_file()
            && path
                .extension()
                .is_some_and(|ext| ext == "ts" || ext == "js")
        {
            let content = fs::read_to_string(&path).unwrap();
            fs::write(&path, format!("// @bit-no-check\n// @ts-nocheck\n{content}")).unwrap();
        }
    }
}

fn setup_jest_spec(spec_content: Option<&str>) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    if let Some(content) = spec_content {
        helper.output_file("comp1/index.spec.js", content);
    }
    helper.native("add comp1");
    helper.run("link --rewire");
    helper.run("compile");
    helper
}

fn setup_custom_env(helper: &Helper, folder: &str, pkgs: &[&str], custom_pattern: bool) -> String {
    copy_fixture_ext_recursive(helper, folder);
    if pkgs
        .iter()
        .any(|pkg| pkg.starts_with("@teambit/react.react-env"))
    {
        helper.add_key_val_to_dependency_resolver_policy("@teambit/react.react-env", "1.3.5");
    }
    let mut env_jsonc = json!({
        "policy": {
            "dev": [
                { "name": "@types/mocha", "version": "^10.0.0", "hidden": true, "force": true },
                { "name": "@types/chai", "version": "^4.3.4", "hidden": true, "force": true },
                { "name": "@types/jest", "version": "29.2.2", "hidden": true, "force": true }
            ]
        }
    });
    if custom_pattern {
        env_jsonc["patterns"] = json!({
            "compositions": ["**/*.composition.*", "**/*.preview.*"],
            "docs": ["**/*.docs.*"],
            "tests": ["**/*.custom-pattern.*"]
        });
    }
    helper.output_file(&format!("{folder}/env.jsonc"), &env_jsonc.to_string());
    helper.native(&format!("add {folder}"));
    helper.add_extension_to_variant(folder, "teambit.envs/env", json!({}));
    config::set_component_env(&helper.scopes.local_path, folder, "teambit.envs/env");
    helper.run("link");
    for &(pkg, ver) in &[("chai", "^4.3.7"), ("@types/chai", "^4.3.4"), ("@types/mocha", "^10.0.0")]
    {
        helper.add_key_val_to_dependency_resolver_policy(pkg, ver);
    }
    helper.native(&format!("install {}", pkgs.join(" ")));
    helper.run("compile");
    format!("{}/{folder}", helper.scopes.remote)
}

fn setup_mocha_env(spec_content: &str) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_id = setup_custom_env(&helper, "mocha-only-test-env", MOCHA_PKGS, false);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file("comp1/index.spec.ts", spec_content);
    helper.native("add comp1");
    config::set_component_env(&helper.scopes.local_path, "comp1", &env_id);
    helper
}

fn setup_mocha_spec_files(custom_pattern: bool) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_id = setup_custom_env(&helper, "mocha-only-test-env", MOCHA_PKGS, custom_pattern);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file("comp1/first.spec.ts", PASSING_MOCHA_SPEC);
    helper.output_file("comp1/second.spec.ts", PASSING_MOCHA_SPEC);
    if custom_pattern {
        helper.output_file("comp1/third.custom-pattern.ts", PASSING_MOCHA_SPEC);
    }
    helper.native("add comp1");
    config::set_component_env(&helper.scopes.local_path, "comp1", &env_id);
    helper
}

fn setup_multi_testers() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_id = setup_custom_env(&helper, "multi-jest-testers-env", JEST_ENV_PKGS, false);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file("comp1/comp1.spec.ts", PASSING_JEST_SPEC);
    helper.output_file("comp1/comp1.custom-pattern-1.spec.ts", PASSING_JEST_SPEC);
    helper.output_file("comp1/comp1.custom-pattern-2.spec.ts", PASSING_JEST_SPEC);
    helper.native("add comp1");
    config::set_component_env(&helper.scopes.local_path, "comp1", &env_id);
    helper
}

fn setup_invalid_jest_env() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_id = setup_custom_env(&helper, "invalid-jest-config-env", &JEST_ENV_PKGS[..3], false);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file("comp1/comp1.spec.ts", PASSING_JEST_SPEC);
    helper.native("add comp1");
    config::set_component_env(&helper.scopes.local_path, "comp1", &env_id);
    helper
}

fn combined_out(run: &Run) -> String {
    format!("{}\n{}", run.stdout, run.stderr)
}

#[test]
fn jest_no_test_files_does_not_throw() {
    assert!(setup_jest_spec(None).run("test").contains("no tests found"));
}

#[test]
fn jest_no_test_files_build_does_not_throw() {
    assert!(setup_jest_spec(None).run("build").contains("build succeeded"));
}

#[test]
fn jest_passing_tests_bit_test() {
    assert!(combined_out(&setup_jest_spec(Some(PASSING_JEST_SPEC)).cmd("test")).contains("PASS"));
}

#[test]
fn jest_passing_tests_bit_build() {
    assert!(combined_out(&setup_jest_spec(Some(PASSING_JEST_SPEC)).cmd("build")).contains("PASS"));
}

#[test]
fn jest_failing_tests_exit_non_zero() {
    assert!(!setup_jest_spec(Some(FAILING_JEST_SPEC)).cmd("test").status.success());
}

#[test]
fn jest_failing_tests_show_output() {
    assert!(combined_out(&setup_jest_spec(Some(FAILING_JEST_SPEC)).cmd("test")).contains("FAIL"));
}

#[test]
fn jest_failing_tests_build_exit_non_zero() {
    assert!(!setup_jest_spec(Some(FAILING_JEST_SPEC)).cmd("build").status.success());
}

#[test]
fn jest_failing_tests_build_show_error() {
    assert!(combined_out(&setup_jest_spec(Some(FAILING_JEST_SPEC)).cmd("build")).contains("FAIL"));
}

#[test]
fn jest_errored_test_exit_non_zero() {
    assert!(!setup_jest_spec(Some(ERRORED_JEST_SPEC)).cmd("test").status.success());
}

#[test]
fn jest_errored_test_show_error() {
    assert!(
        combined_out(&setup_jest_spec(Some(ERRORED_JEST_SPEC)).cmd("test")).contains("some-err"),
    );
}

#[test]
fn jest_errored_test_build_exit_and_error() {
    let run = setup_jest_spec(Some(ERRORED_JEST_SPEC)).cmd("build");
    assert!(!run.status.success() && combined_out(&run).contains("some-err"));
}

#[test]
fn jest_empty_test_exit_non_zero() {
    assert!(!setup_jest_spec(Some("// nothing here")).cmd("test").status.success());
}

#[test]
fn jest_empty_test_show_error() {
    let out = combined_out(&setup_jest_spec(Some("// nothing here")).cmd("test"));
    assert!(out.contains("Your test suite must contain at least one test"));
}

#[test]
fn jest_empty_test_build_exit_and_error() {
    let run = setup_jest_spec(Some("// nothing here")).cmd("build");
    assert!(!run.status.success());
    assert!(combined_out(&run).contains("Your test suite must contain at least one test"));
}

#[test]
fn jest_describe_only_test_passes() {
    assert!(setup_jest_spec(Some(DESCRIBE_ONLY_SPEC)).cmd("test").status.success());
}

#[test]
fn jest_describe_only_build_fails() {
    let run = setup_invalid_jest_env().cmd("test");
    assert!(
        !run.status.success() && combined_out(&run).contains("someUndefinedFunc is not defined"),
    );
}

#[test]
fn jest_describe_only_tag_fails() {
    let run = setup_invalid_jest_env().cmd("build comp1");
    assert!(
        !run.status.success() && combined_out(&run).contains("someUndefinedFunc is not defined"),
    );
}

#[test]
fn jest_env_manipulation_custom_config() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_id = setup_custom_env(&helper, "custom-jest-resolve-env", &JEST_ENV_PKGS[..3], false);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file("comp1/comp1.spec.ts", PASSING_JEST_SPEC);
    helper.output_file("comp1/comp1.custom-pattern.spec.ts", PASSING_JEST_SPEC);
    helper.native("add comp1");
    config::set_component_env(&helper.scopes.local_path, "comp1", &env_id);
    let out = combined_out(&helper.cmd("test"));
    assert!(out.contains("comp1.custom-pattern.spec") && !out.contains("comp1.spec"));
}

#[test]
fn jest_junit_flag_creates_xml_file() {
    let helper = setup_jest_spec(Some(FAILING_JEST_SPEC));
    let _ = helper.cmd("test --junit junit.xml");
    assert!(helper.scopes.local_path.join("junit.xml").is_file());
}

#[test]
fn jest_junit_xml_contains_failing_results() {
    let helper = setup_jest_spec(Some(FAILING_JEST_SPEC));
    let _ = helper.cmd("test --junit junit.xml");
    let xml = fs::read_to_string(helper.scopes.local_path.join("junit.xml")).unwrap();
    assert!(xml.contains(r#"failures="1""#));
}

#[test]
fn jest_esm_syntax_test_passes() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.mjs", "export function isEven(x) { return x % 2 === 0; }");
    helper.output_file(
        "comp1/index.spec.mjs",
        "import { isEven } from './index.mjs';\ntest('isEven', () => { expect(isEven(2)).toBe(true); });\n",
    );
    helper.native("add comp1");
    helper.run("compile");
    assert!(helper.cmd("test").status.success());
}

#[test]
fn jest_coverage_displays_result() {
    let helper = setup_jest_spec(Some(PASSING_JEST_SPEC));
    assert!(combined_out(&helper.cmd("test --coverage")).contains("% Stmts"));
}

#[test]
fn jest_coverage_displays_files() {
    let helper = setup_jest_spec(Some(PASSING_JEST_SPEC));
    assert!(combined_out(&helper.cmd("test --coverage")).contains("All files"));
}

#[test]
fn mocha_passing_tests_bit_test() {
    assert!(combined_out(&setup_mocha_env(PASSING_MOCHA_SPEC).cmd("test")).contains("1 passing"));
}

#[test]
fn mocha_passing_tests_bit_build() {
    assert!(
        combined_out(&setup_mocha_env(PASSING_MOCHA_SPEC).cmd("build comp1")).contains("1 passing"),
    );
}

#[test]
fn mocha_failing_tests_exit_non_zero() {
    assert!(!setup_mocha_env(FAILING_MOCHA_SPEC).cmd("test").status.success());
}

#[test]
fn mocha_failing_tests_show_output() {
    assert!(combined_out(&setup_mocha_env(FAILING_MOCHA_SPEC).cmd("test")).contains("1 failing"));
}

#[test]
fn mocha_failing_tests_build_exit_non_zero() {
    assert!(!setup_mocha_env(FAILING_MOCHA_SPEC).cmd("build comp1").status.success());
}

#[test]
fn mocha_failing_tests_build_show_output() {
    assert!(
        combined_out(&setup_mocha_env(FAILING_MOCHA_SPEC).cmd("build comp1")).contains("1 failing"),
    );
}

#[test]
fn mocha_syntax_error_test_exit_and_error() {
    let run = setup_mocha_env(ERRORED_MOCHA_SPEC).cmd("test");
    assert!(!run.status.success() && combined_out(&run).contains("SomeError"));
}

#[test]
fn mocha_syntax_error_build_exit_and_error() {
    let run = setup_mocha_env(ERRORED_MOCHA_SPEC).cmd("build comp1");
    assert!(!run.status.success() && combined_out(&run).contains("SomeError"));
}

#[test]
fn mocha_spec_files_default_patterns() {
    assert!(combined_out(&setup_mocha_spec_files(false).cmd("test")).contains("2 passing"));
}

#[test]
fn mocha_spec_files_custom_env_jsonc_patterns() {
    assert!(combined_out(&setup_mocha_spec_files(true).cmd("test")).contains("1 passing"));
}

#[test]
fn mocha_spec_files_user_pattern_bit_test() {
    assert!(
        combined_out(&setup_mocha_spec_files(false).cmd("test comp1/first.spec.ts"))
            .contains("1 passing"),
    );
}

#[test]
fn mocha_spec_files_user_pattern_bit_show() {
    let helper = setup_mocha_spec_files(false);
    let _ = helper.cmd("test comp1/first.spec.ts");
    let show = helper.run("show comp1");
    assert!(show.contains("first.spec.ts (teambit.defender/tester)"));
    assert!(show.contains("second.spec.ts (teambit.defender/tester)"));
}

#[test]
fn multiple_testers_ws_jest() {
    assert!(
        combined_out(&setup_multi_testers().cmd("test")).contains("comp1.custom-pattern-1.spec"),
    );
}

#[test]
fn multiple_testers_ws_mocha() {
    assert!(
        combined_out(&setup_multi_testers().cmd("test")).contains("comp1.custom-pattern-2.spec"),
    );
}

#[test]
fn multiple_testers_ws_total() {
    assert!(combined_out(&setup_multi_testers().cmd("test")).contains("Test Suites:"));
}

#[test]
fn multiple_testers_build_jest() {
    assert!(
        combined_out(&setup_multi_testers().cmd("build comp1"))
            .contains("comp1.custom-pattern-1.spec"),
    );
}

#[test]
fn multiple_testers_build_mocha() {
    assert!(
        combined_out(&setup_multi_testers().cmd("build comp1"))
            .contains("comp1.custom-pattern-2.spec"),
    );
}

#[test]
fn multiple_testers_build_builder_data() {
    let out = combined_out(&setup_multi_testers().cmd("build comp1"));
    assert_eq!(out.matches("Test Suites: 1 passed").count(), 2);
}
