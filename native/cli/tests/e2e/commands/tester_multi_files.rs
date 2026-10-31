//! Explicit files across components keep exact selection and command effects.
use super::{move_paths::support, tester::timings, tester_multi_junit};
use crate::helper::Helper;

fn fixture() -> Helper {
    let helper = support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), &format!("const fs=require('fs');it('{name}',()=>{{const end=Date.now()+20;while(Date.now()<end){{}}fs.appendFileSync('selected-effect','x');expect(2+2).toBe(4);}});\n"));
        helper.output_file(&format!("{name}/excluded.spec.js"), "const fs=require('fs');it('excluded',()=>{fs.appendFileSync('excluded-effect','x');expect(2+2).toBe(5);});\n");
    }
    helper
}
fn assert_effects(helper: &Helper) {
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("selected-effect")).unwrap(),
        "xx",
    );
    assert!(!helper.scopes.local_path.join("excluded-effect").exists());
}

#[test]
fn multi_test_files_select_only_requested_paths_and_deduplicate() {
    let helper = fixture();
    let result = support::compare_with_stdout(
        &helper,
        "test comp1/index.spec.js ./comp2/index.spec.js comp1/index.spec.js --json",
        timings,
    );
    assert!(result.status.success());
    assert_effects(&helper);
}

#[test]
fn multi_test_files_combine_summary_and_coverage() {
    let helper = fixture();
    let result = support::compare_with_stdout(
        &helper,
        "test comp1/index.spec.js comp2/index.spec.js --json --summary --coverage",
        str::to_owned,
    );
    assert!(result.status.success());
    assert_effects(&helper);
    assert!(!helper.scopes.local_path.join("coverage").exists());
}

#[test]
fn multi_test_files_generate_junit_for_each_selected_component() {
    let helper = fixture();
    let result = tester_multi_junit::compare_file_order(
        &helper,
        "test comp1/index.spec.js comp2/index.spec.js --json --junit reports/test.xml",
        false,
    );
    assert!(result.status.success());
    assert_effects(&helper);
}

#[test]
fn multi_test_files_retain_validation_for_unrecognized_paths() {
    let helper = fixture();
    let result = support::compare_declined(
        &helper,
        "test comp1/index.spec.js comp2/index.js --json",
        str::to_owned,
    );
    assert_eq!(result.status.code(), Some(1));
    assert!(!helper.scopes.local_path.join("selected-effect").exists());
    assert!(!helper.scopes.local_path.join("excluded-effect").exists());
}

#[test]
fn multi_test_files_keep_reversed_component_order() {
    let helper = fixture();
    let result = support::compare_with_stdout(
        &helper,
        "test comp2/index.spec.js comp1/index.spec.js --json --summary",
        str::to_owned,
    );
    assert!(result.status.success());
    let data: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert!(
        data["componentsWithTests"][0]["id"]
            .as_str()
            .unwrap()
            .ends_with("/comp2"),
    );
    assert_effects(&helper);
}

#[test]
fn multi_test_files_keep_reversed_junit_suite_order() {
    let helper = fixture();
    let result = tester_multi_junit::compare_file_order(
        &helper,
        "test comp2/index.spec.js comp1/index.spec.js --json --junit reports/test.xml",
        false,
    );
    assert!(result.status.success());
    let xml = std::fs::read_to_string(helper.scopes.local_path.join("reports/test.xml")).unwrap();
    assert!(xml.find("/comp2@").unwrap() < xml.find("/comp1@").unwrap());
    assert_effects(&helper);
}

#[test]
fn multi_test_files_accept_absolute_paths_in_input_order() {
    let helper = fixture();
    let first = helper.scopes.local_path.join("comp2/index.spec.js");
    let second = helper.scopes.local_path.join("comp1/index.spec.js");
    let command = format!("test '{}' '{}' --json --summary", first.display(), second.display());
    let result = support::compare_with_stdout(&helper, &command, str::to_owned);
    assert!(result.status.success());
    let data: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert!(
        data["componentsWithTests"][0]["id"]
            .as_str()
            .unwrap()
            .ends_with("/comp2"),
    );
    assert_effects(&helper);
}
