//! Port of `e2e/harmony/import-non-main-files.e2e.ts` for internal non-main file import issues ([`importing_non_main_js_file_shows_issue_and_path`]).
//!
//! Verifies `ImportNonMainFiles` issue detection on `.js` imports and exemption on `.json` imports in `bit status`.

use crate::helper::{Helper, issue_types, parse};

/// Verifies that importing a non-main `.js` file triggers an `ImportNonMainFiles` issue in `bit status` ([`issue_types`]).
#[test]
fn importing_non_main_js_file_shows_issue_and_path() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, false, "");
    helper.output_file("comp2/non-main.js", "export function nonMain(){}");
    helper.output_file(
        "comp1/index.js",
        &format!("import {{ nonMain }} from '@{}/comp2/non-main';", helper.scopes.remote),
    );
    helper.run("link");

    let status_json = parse(&helper.native("status --json"));
    let with_issues = status_json["componentsWithIssues"].as_array().unwrap();
    assert_eq!(with_issues.len(), 1);
    assert!(
        with_issues[0]["id"]
            .as_str()
            .unwrap()
            .contains("comp1"),
    );

    let status = helper.native("status");
    assert!(
        status.contains(&format!("index.js -> @{}/comp2/non-main.js", helper.scopes.remote)),
        "{status}",
    );
    let types = issue_types(&status_json);
    assert!(
        types.contains(&"ImportNonMainFiles".to_string()),
        "expected ImportNonMainFiles in {types:?}",
    );
}

/// Verifies that importing from a dependency's main file before compilation does not raise `ImportNonMainFiles` ([`issue_types`]).
/// importing internal files flow › importing from a main file when the dependency was not compiled yet › should not show the import-non-main-file issue
#[test]
fn importing_from_main_file_when_dependency_not_compiled_yet() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file(
        "comp1/index.js",
        "const comp2 = require('../comp2');\nmodule.exports = () => `comp1 and ${comp2()}`;",
    );
    helper.output_file("comp2/index.js", "module.exports = () => 'comp2';");
    helper.native("add comp1");
    helper.native("add comp2");
    helper.run("link --rewire");
    helper.run("compile comp1");

    let status_json = parse(&helper.native("status --json"));
    let types = issue_types(&status_json);
    assert!(
        !types.contains(&"ImportNonMainFiles".to_string()),
        "unexpected ImportNonMainFiles in {types:?}",
    );
}

/// Verifies that importing a non-main `.json` file does not raise an `ImportNonMainFiles` issue ([`Helper`], [`parse`], [`importing_non_main_js_file_shows_issue_and_path`], [`importing_from_main_file_when_dependency_not_compiled_yet`]).
/// importing internal files flow › importing of a non-main json file › bit status should not show it as an invalid component
#[test]
fn importing_non_main_json_file_does_not_show_issue() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, false, "");
    helper.output_file("comp2/non-main.json", "{}");
    helper.output_file(
        "comp1/index.js",
        &format!("import nonMain from '@{}/comp2/non-main.json';", helper.scopes.remote),
    );
    helper.run("link");

    let status_json = parse(&helper.native("status --json"));
    let with_issues = status_json["componentsWithIssues"].as_array().unwrap();
    assert_eq!(with_issues.len(), 0);
}
