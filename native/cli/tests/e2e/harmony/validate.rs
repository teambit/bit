use crate::helper::Helper;

#[test]
fn validate_clean_type_errors_lint_errors_skip_tasks_unmodified_pattern_and_empty() {
    let helper = Helper::new();

    // validating components without errors
    helper.re_init_workspace();
    helper.populate_components(1, true, "");

    let output = helper.native("validate");
    assert!(output.contains("1/3 Type Checking"));
    assert!(output.contains("2/3 Linting"));
    assert!(output.contains("3/3 Testing"));
    assert!(output.contains("All validation checks passed"));

    let output = helper.native("validate --continue-on-error");
    assert!(output.contains("--continue-on-error is deprecated"));
    assert!(output.contains("All validation checks passed"));

    // validating components with type errors
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/comp1.ts", "const x: number = \"string\";\n");

    let run = helper.native_run("validate");
    assert!(!run.status.success());
    let output = format!("{}\n{}", run.stdout, run.stderr);
    assert!(output.contains("1/3 Type Checking"));
    assert!(output.contains("2/3 Linting"));
    assert!(output.contains("3/3 Testing"));
    assert!(output.contains("Validation failed"));

    let run = helper.native_run("validate --fail-fast");
    assert!(!run.status.success());
    let output = format!("{}\n{}", run.stdout, run.stderr);
    assert!(output.contains("1/3 Type Checking"));
    assert!(output.contains("Validation failed"));
    assert!(!output.contains("2/3 Linting"));
    assert!(!output.contains("3/3 Testing"));

    // validating components with lint errors
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/comp1.js", "console.log(undefinedVariable);\n");

    let run = helper.native_run("validate");
    assert!(!run.status.success());
    let output = format!("{}\n{}", run.stdout, run.stderr);
    assert!(output.contains("1/3 Type Checking"));
    assert!(output.contains("2/3 Linting"));
    assert!(output.contains("3/3 Testing"));
    assert!(output.contains("Validation failed"));
    assert!(output.contains("error"));

    let run = helper.native_run("validate --fail-fast");
    assert!(!run.status.success());
    let output = format!("{}\n{}", run.stdout, run.stderr);
    assert!(output.contains("1/3 Type Checking"));
    assert!(output.contains("2/3 Linting"));
    assert!(output.contains("Validation failed"));
    assert!(!output.contains("3/3 Testing"));

    let output = helper.native("validate --skip-tasks lint");
    assert!(!output.contains("Linting"));
    assert!(output.contains("All validation checks passed"));

    let output = helper.native(r#"validate --skip-tasks "lint,test""#);
    assert!(!output.contains("Linting"));
    assert!(!output.contains("Testing"));
    assert!(output.contains("Type Checking"));

    let output = helper.native(r#"validate --skip-tasks "check-types,lint,test""#);
    assert!(output.contains("All validation tasks were skipped"));

    let run = helper.native_run(r#"validate --skip-tasks "lnt""#);
    assert!(!run.status.success());
    let output = format!("{}\n{}", run.stdout, run.stderr);
    assert!(output.contains("unknown skip-tasks: lnt"));

    // validating with --unmodified flag
    helper.re_init_workspace();
    helper.populate_components(2, true, "");
    helper.tag_all_without_build("");

    let output = helper.native("validate");
    assert!(output.contains("No components found to validate"));

    let output = helper.native("validate --unmodified");
    assert!(output.contains("Validating 2 component(s)"));
    assert!(output.contains("All validation checks passed"));

    let output = helper.native("validate --all");
    assert!(output.contains("--all is deprecated, use --unmodified instead"));
    assert!(output.contains("Validating 2 component(s)"));
    assert!(output.contains("All validation checks passed"));

    // validating with component pattern
    helper.re_init_workspace();
    helper.populate_components(2, true, "");
    let output = helper.native("validate comp1");
    assert!(output.contains("Validating 1 component(s)"));
    assert!(output.contains("All validation checks passed"));

    // validating with no components
    helper.re_init_workspace();
    let output = helper.native("validate");
    assert!(output.contains("No components found to validate"));
}
