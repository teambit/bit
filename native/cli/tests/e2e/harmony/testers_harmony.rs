//! Cases from:
//! - `e2e/harmony/jest.e2e.ts`
//! - `e2e/harmony/mocha-tester.e2e.ts`
//! - `e2e/harmony/mocha-tester-spec-files.e2e.ts`
//! - `e2e/harmony/multiple-testers.e2e.ts`

use crate::{
    allow_known_failure,
    helper::{Helper, Run},
    known_failure::KnownResult,
};
use serde_json::json;
use std::fs;

const PASSING_JEST_SPEC: &str = "describe('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n});\n";
const FAILING_JEST_SPEC: &str = "describe('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n  it('should fail', () => {\n    expect(true).toBe(false);\n  });\n});\n";
const ERRORED_JEST_SPEC: &str = "throw new Error('some-err');\ndescribe('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n});\n";
const DESCRIBE_ONLY_SPEC: &str = "describe.only('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n});\n";
const PASSING_MOCHA_SPEC: &str = "import { expect } from 'chai';\ndescribe('comp1', () => {\n  it('should pass', () => {\n    expect(true).to.be.true;\n  });\n});\n";
const FAILING_MOCHA_SPEC: &str = "import { expect } from 'chai';\ndescribe('comp1', () => {\n  it('should fail', () => {\n    expect(true).to.be.false;\n  });\n});\n";

fn setup_jest_spec(helper: &Helper, spec_content: Option<&str>) -> KnownResult<()> {
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    if let Some(content) = spec_content {
        helper.output_file("comp1/index.spec.js", content);
    }
    helper.native("add comp1");
    helper.run("link --rewire");
    helper.native_output_or_known("compile")?;
    Ok(())
}

fn setup_mocha_env(helper: &Helper, spec_content: &str) -> KnownResult<String> {
    helper.set_workspace_with_remote_scope();
    let folder = "mocha-only-test-env";
    helper.copy_fixture_extensions(folder);
    helper.native(&format!("add {folder}"));
    helper.add_extension_to_variant(folder, "teambit.envs/env", json!({}));
    helper.run("link");
    helper.add_key_val_to_dependency_resolver_policy("chai", "^4.3.7");
    helper.add_key_val_to_dependency_resolver_policy("@types/chai", "^4.3.4");
    helper.add_key_val_to_dependency_resolver_policy("@types/mocha", "^10.0.0");
    helper.native_output_or_known("install")?;
    helper.native_output_or_known("compile")?;
    let env_id = format!("{}/{folder}", helper.scopes.remote);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file("comp1/index.spec.ts", spec_content);
    helper.native("add comp1");
    helper.add_extension_to_variant("*", &env_id, json!({}));
    helper.native_output_or_known("compile")?;
    Ok(env_id)
}

fn setup_mocha_spec_files(helper: &Helper, custom_pattern: bool) -> KnownResult<()> {
    helper.set_workspace_with_remote_scope();
    let folder = "mocha-only-test-env";
    helper.copy_fixture_extensions(folder);
    if custom_pattern {
        let env_jsonc = json!({
            "patterns": {
                "compositions": ["**/*.composition.*", "**/*.preview.*"],
                "docs": ["**/*.docs.*"],
                "tests": ["**/*.custom-pattern.*"]
            }
        });
        helper.output_file(
            &format!("{folder}/env.jsonc"),
            &serde_json::to_string_pretty(&env_jsonc).unwrap(),
        );
    }
    helper.native(&format!("add {folder}"));
    helper.add_extension_to_variant(folder, "teambit.envs/env", json!({}));
    helper.run("link");
    helper.add_key_val_to_dependency_resolver_policy("chai", "^4.3.7");
    helper.add_key_val_to_dependency_resolver_policy("@types/chai", "^4.3.4");
    helper.add_key_val_to_dependency_resolver_policy("@types/mocha", "^10.0.0");
    helper.native_output_or_known("install")?;
    helper.native_output_or_known("compile")?;
    let env_id = format!("{}/{folder}", helper.scopes.remote);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file("comp1/first.spec.ts", PASSING_MOCHA_SPEC);
    helper.output_file("comp1/second.spec.ts", PASSING_MOCHA_SPEC);
    if custom_pattern {
        helper.output_file("comp1/third.custom-pattern.ts", PASSING_MOCHA_SPEC);
    }
    helper.native("add comp1");
    helper.add_extension_to_variant("comp1", &env_id, json!({}));
    helper.native_output_or_known("compile")?;
    Ok(())
}

fn setup_multi_testers(helper: &Helper) -> KnownResult<()> {
    helper.set_workspace_with_remote_scope();
    let folder = "multi-jest-testers-env";
    helper.copy_fixture_extensions(folder);
    helper.native(&format!("add {folder}"));
    helper.add_extension_to_variant(folder, "teambit.envs/env", json!({}));
    helper.run("link");
    helper.add_key_val_to_dependency_resolver_policy("chai", "^4.3.7");
    helper.add_key_val_to_dependency_resolver_policy("@types/chai", "^4.3.4");
    helper.add_key_val_to_dependency_resolver_policy("@types/mocha", "^10.0.0");
    helper.native_output_or_known("install")?;
    helper.native_output_or_known("compile")?;
    let env_id = format!("{}/{folder}", helper.scopes.remote);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file("comp1/comp1.jest.spec.ts", PASSING_JEST_SPEC);
    helper.output_file("comp1/comp1.mocha.spec.ts", PASSING_MOCHA_SPEC);
    helper.native("add comp1");
    helper.add_extension_to_variant("*", &env_id, json!({}));
    helper.native_output_or_known("compile")?;
    Ok(())
}

fn combined_out(run: &Run) -> String {
    format!("{}\n{}", run.stdout, run.stderr)
}

mod known_failures {
    use super::{
        DESCRIBE_ONLY_SPEC, ERRORED_JEST_SPEC, FAILING_JEST_SPEC, FAILING_MOCHA_SPEC, Helper,
        PASSING_JEST_SPEC, PASSING_MOCHA_SPEC, allow_known_failure, combined_out, fs, json,
        setup_jest_spec, setup_mocha_env, setup_mocha_spec_files, setup_multi_testers,
    };

    #[test]
    fn jest_no_test_files_does_not_throw() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, None));
        let output = helper.run("test");
        assert!(output.contains("no tests found"));
    }

    #[test]
    fn jest_no_test_files_build_does_not_throw() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, None));
        let output = helper.run("build");
        assert!(output.contains("build succeeded"));
    }

    #[test]
    fn jest_passing_tests_bit_test() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(PASSING_JEST_SPEC)));
        let run = helper.cmd("test");
        assert!(combined_out(&run).contains("PASS"));
    }

    #[test]
    fn jest_passing_tests_bit_build() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(PASSING_JEST_SPEC)));
        let run = helper.cmd("build");
        assert!(combined_out(&run).contains("PASS"));
    }

    #[test]
    fn jest_failing_tests_exit_non_zero() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(FAILING_JEST_SPEC)));
        assert!(!helper.cmd("test").status.success());
    }

    #[test]
    fn jest_failing_tests_show_output() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(FAILING_JEST_SPEC)));
        assert!(combined_out(&helper.cmd("test")).contains("FAIL"));
    }

    #[test]
    fn jest_failing_tests_build_exit_non_zero() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(FAILING_JEST_SPEC)));
        assert!(!helper.cmd("build").status.success());
    }

    #[test]
    fn jest_failing_tests_build_show_error() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(FAILING_JEST_SPEC)));
        assert!(combined_out(&helper.cmd("build")).contains("FAIL"));
    }

    #[test]
    fn jest_errored_test_exit_non_zero() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(ERRORED_JEST_SPEC)));
        assert!(!helper.cmd("test").status.success());
    }

    #[test]
    fn jest_errored_test_show_error() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(ERRORED_JEST_SPEC)));
        let out = combined_out(&helper.cmd("test"));
        assert!(out.contains("some-err"));
    }

    #[test]
    fn jest_errored_test_build_exit_and_error() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(ERRORED_JEST_SPEC)));
        let run = helper.cmd("build");
        assert!(!run.status.success());
        assert!(combined_out(&run).contains("some-err"));
    }

    #[test]
    fn jest_empty_test_exit_non_zero() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some("// nothing here")));
        assert!(!helper.cmd("test").status.success());
    }

    #[test]
    fn jest_empty_test_show_error() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some("// nothing here")));
        assert!(
            combined_out(&helper.cmd("test"))
                .contains("Your test suite must contain at least one test"),
        );
    }

    #[test]
    fn jest_empty_test_build_exit_and_error() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some("// nothing here")));
        let run = helper.cmd("build");
        assert!(!run.status.success());
        assert!(combined_out(&run).contains("Your test suite must contain at least one test"));
    }

    #[test]
    fn jest_describe_only_test_passes() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(DESCRIBE_ONLY_SPEC)));
        assert!(helper.cmd("test").status.success());
    }

    #[test]
    fn jest_describe_only_build_fails() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(DESCRIBE_ONLY_SPEC)));
        assert!(!helper.cmd("build").status.success());
    }

    #[test]
    fn jest_describe_only_tag_fails() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(DESCRIBE_ONLY_SPEC)));
        assert!(!helper.cmd("tag").status.success());
    }

    #[test]
    fn jest_env_manipulation_custom_config() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let folder = "custom-jest-resolve-env";
        helper.copy_fixture_extensions(folder);
        helper.native(&format!("add {folder}"));
        helper.add_extension_to_variant(folder, "teambit.envs/env", json!({}));
        helper.run("link");
        helper.add_key_val_to_dependency_resolver_policy("jest", "^29.0.0");
        let _ = allow_known_failure!(helper.native_output_or_known("compile"));
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
        helper.output_file("comp1/index.spec.js", PASSING_JEST_SPEC);
        helper.native("add comp1");
        helper.add_extension_to_variant(
            "*",
            &format!("{}/{folder}", helper.scopes.remote),
            json!({}),
        );
        helper.compile();
        assert!(
            combined_out(&helper.cmd("test")).contains("From custom-jest-env: customTransformer"),
        );
    }

    #[test]
    fn jest_junit_flag_creates_xml_file() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(FAILING_JEST_SPEC)));
        let _ = helper.cmd("test --junit junit.xml");
        assert!(helper.scopes.local_path.join("junit.xml").is_file());
    }

    #[test]
    fn jest_junit_xml_contains_failing_results() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(FAILING_JEST_SPEC)));
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
        let _ = allow_known_failure!(helper.native_output_or_known("compile"));
        assert!(helper.cmd("test").status.success());
    }

    #[test]
    fn jest_coverage_displays_result() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(PASSING_JEST_SPEC)));
        let run = helper.cmd("test --coverage");
        assert!(combined_out(&run).contains("% Stmts"));
    }

    #[test]
    fn jest_coverage_displays_files() {
        let helper = Helper::new();
        allow_known_failure!(setup_jest_spec(&helper, Some(PASSING_JEST_SPEC)));
        let run = helper.cmd("test --coverage");
        assert!(combined_out(&run).contains("All files"));
    }

    #[test]
    fn mocha_passing_tests_bit_test() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_env(&helper, PASSING_MOCHA_SPEC));
        assert!(combined_out(&helper.cmd("test")).contains("1 passing"));
    }

    #[test]
    fn mocha_passing_tests_bit_build() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_env(&helper, PASSING_MOCHA_SPEC));
        assert!(combined_out(&helper.cmd("build")).contains("1 passing"));
    }

    #[test]
    fn mocha_failing_tests_exit_non_zero() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_env(&helper, FAILING_MOCHA_SPEC));
        assert!(!helper.cmd("test").status.success());
    }

    #[test]
    fn mocha_failing_tests_show_output() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_env(&helper, FAILING_MOCHA_SPEC));
        assert!(combined_out(&helper.cmd("test")).contains("1 failing"));
    }

    #[test]
    fn mocha_failing_tests_build_exit_non_zero() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_env(&helper, FAILING_MOCHA_SPEC));
        assert!(!helper.cmd("build").status.success());
    }

    #[test]
    fn mocha_failing_tests_build_show_output() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_env(&helper, FAILING_MOCHA_SPEC));
        assert!(combined_out(&helper.cmd("build")).contains("1 failing"));
    }

    #[test]
    fn mocha_syntax_error_test_exit_and_error() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_env(&helper, "describe('comp1', () => {"));
        let run = helper.cmd("test");
        assert!(!run.status.success());
        assert!(combined_out(&run).contains("TransformError"));
    }

    #[test]
    fn mocha_syntax_error_build_exit_and_error() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_env(&helper, "describe('comp1', () => {"));
        let run = helper.cmd("build");
        assert!(!run.status.success());
        assert!(combined_out(&run).contains("TransformError"));
    }

    #[test]
    fn mocha_spec_files_default_patterns() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_spec_files(&helper, false));
        assert!(combined_out(&helper.cmd("test")).contains("2 passing"));
    }

    #[test]
    fn mocha_spec_files_custom_env_jsonc_patterns() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_spec_files(&helper, true));
        assert!(combined_out(&helper.cmd("test")).contains("1 passing"));
    }

    #[test]
    fn mocha_spec_files_user_pattern_bit_test() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_spec_files(&helper, false));
        assert!(combined_out(&helper.cmd("test first")).contains("1 passing"));
    }

    #[test]
    fn mocha_spec_files_user_pattern_bit_show() {
        let helper = Helper::new();
        allow_known_failure!(setup_mocha_spec_files(&helper, false));
        let _ = helper.cmd("test first");
        let show = helper.run("show comp1");
        assert!(show.contains("first.spec.ts (teambit.defender/tester)"));
        assert!(show.contains("second.spec.ts (teambit.defender/tester)"));
    }

    #[test]
    fn multiple_testers_ws_jest() {
        let helper = Helper::new();
        allow_known_failure!(setup_multi_testers(&helper));
        assert!(combined_out(&helper.cmd("test")).contains("comp1.jest.spec.ts"));
    }

    #[test]
    fn multiple_testers_ws_mocha() {
        let helper = Helper::new();
        allow_known_failure!(setup_multi_testers(&helper));
        assert!(combined_out(&helper.cmd("test")).contains("1 passing"));
    }

    #[test]
    fn multiple_testers_ws_total() {
        let helper = Helper::new();
        allow_known_failure!(setup_multi_testers(&helper));
        assert!(combined_out(&helper.cmd("test")).contains("Test Suites:"));
    }

    #[test]
    fn multiple_testers_build_jest() {
        let helper = Helper::new();
        allow_known_failure!(setup_multi_testers(&helper));
        assert!(combined_out(&helper.cmd("build")).contains("comp1.jest.spec.ts"));
    }

    #[test]
    fn multiple_testers_build_mocha() {
        let helper = Helper::new();
        allow_known_failure!(setup_multi_testers(&helper));
        assert!(combined_out(&helper.cmd("build")).contains("1 passing"));
    }

    #[test]
    fn multiple_testers_build_builder_data() {
        let helper = Helper::new();
        allow_known_failure!(setup_multi_testers(&helper));
        helper.run("build");
        let builder = helper.show_aspect_config("comp1", "teambit.pipelines/builder");
        let aspects = builder["data"]["aspectsData"].as_array().unwrap();
        let tester = aspects
            .iter()
            .find(|item| item["aspectId"].as_str() == Some("teambit.defender/tester"))
            .unwrap();
        assert_eq!(tester["data"]["tests"]["components"][0]["results"]["total"].as_u64(), Some(2));
    }
}
