//! `e2e/harmony/status-harmony.e2e.ts`.

use crate::{
    helper::{FOO_FIXTURE, Helper, len, parse, strip_ansi},
    known_failure::Native,
};
use std::ffi::OsStr;

/// Compare the complete status report on fresh copies of one workspace.
fn status_json_parity(helper: &Helper) {
    let copy = helper.clone_workspace();
    let native = helper.native_run("status --json");
    helper.get_cloned_workspace(&copy);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "status --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(!node.native, "{}", node.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(parse(&native.stdout), parse(&node.stdout));
}

fn status_text_parity(helper: &Helper) {
    let copy = helper.clone_workspace();
    let native = helper.native_run("status");
    helper.get_cloned_workspace(&copy);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "status",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(!node.native, "{}", node.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(native.stdout, node.stdout);
}

/// The standard e2e root aspects allow native status and diff.
#[test]
fn standard_root_aspects_run_status_and_diff_natively() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();

    let status = parse(&helper.native("status --json"));
    assert_eq!(len(&status["newComponents"]), 1);
    let diff = strip_ansi(&helper.native("diff bar/foo"));
    assert!(diff.contains(&format!("+{FOO_FIXTURE}")), "{diff}");
}

/// `MISSING_DEPS_SPACE` of `@teambit/component-issues`.
const ISSUE_INDENT: &str = "          ";

/// `statusFailureMsg`.
const STATUS_FAILURE_MSG: &str = "issues found";

fn populated(count: usize) -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(count, true, "");
    helper
}

fn quick() -> Helper {
    let helper = populated(3);
    helper.tag_without_build("comp3", "");
    helper.append_file("comp3/index.js", "\n// modified");
    helper
}

/// dists dir is deleted after caching the components › should show an issue of
/// missing-dists; should exit with non zero exit-code if --strict flag is used
#[test]
fn deleted_dists_after_the_cache_are_missing() {
    let helper = populated(1);
    let issues = helper.status_issues_or_known().native();
    assert!(!issues.contains(&"MissingDists".into()), "{issues:?}");
    helper.delete_path("node_modules/@my-scope/comp1/dist");
    helper.delete_path(
        "node_modules/.bit_roots/teambit.harmony_node/node_modules/@my-scope/comp1/dist",
    );
    let issues = helper.status_issues_or_known().native();
    assert!(issues.contains(&"MissingDists".into()), "{issues:?}");
    let strict = helper.native_or_known("status --strict").native();
    assert_eq!(strict.status.code(), Some(1));
}

/// package dir is deleted from node-modules › should show an issue of
/// missing-links-from-node-modules-to-src
#[test]
fn a_deleted_package_dir_is_a_missing_link() {
    let helper = populated(1);
    let issue = "MissingLinksFromNodeModulesToSrc".to_string();
    let issues = helper.status_issues_or_known().native();
    assert!(!issues.contains(&issue), "{issues:?}");
    helper.delete_path("node_modules/@my-scope/comp1");
    let issues = helper.status_issues_or_known().native();
    assert!(issues.contains(&issue), "{issues:?}");
}

/// components that are both: new and auto-tag-pending › should be shown in the
/// newComponents section only and not in the autoTagPendingComponents
#[test]
fn new_components_are_not_auto_tag_pending() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(3, true, "");
    helper.tag_without_build("comp3", "");
    helper.populate_components(3, true, "v2");
    let status = helper.status_json_or_known().native();
    assert_eq!(len(&status["autoTagPendingComponents"]), 0);
    assert_eq!(len(&status["newComponents"]), 2);
}

/// status --quick flag › should show new and modified components
#[test]
fn quick_status_shows_new_and_modified() {
    let output = quick().native_output_or_known("status --quick").native();
    let expected =
        ["modified components (files only)", "comp3", "new components", "comp1", "comp2"];
    for expected in expected {
        assert!(output.contains(expected), "{expected} in {output}");
    }
}

/// status --quick flag › should return new and modified in json format
#[test]
fn quick_status_json_lists_new_and_modified() {
    let output = quick().native_output_or_known("status --json --quick").native();
    let json = parse(&output);
    let has = |key: &str, id: &str| {
        json[key]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == id)
    };
    assert!(has("modified", "my-scope/comp3"), "{json}");
    assert!(has("newComponents", "my-scope/comp1"), "{json}");
    assert!(has("newComponents", "my-scope/comp2"), "{json}");
}

/// dynamic import › status should not show the component as missing packages
#[test]
fn a_dynamic_import_is_not_a_missing_package() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("bar/foo.js", r#"const a = "./b"; import(a); require(a);"#);
    helper.add_component_bar_foo();
    helper.run("compile");
    let output = helper.native_or_known("status").native().stdout;
    assert!(!output.contains(STATUS_FAILURE_MSG), "{output}");
}

/// main filename is not index and dists are missing › should not show an issue of
/// missing-packages
#[test]
fn a_linked_package_is_not_missing() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.output_file("comp1/comp1.ts", "require('@my-scope/comp2');");
    helper.output_file("comp2/comp2.ts", "");
    helper.run("add comp1");
    helper.run("add comp2");
    helper.run("link");
    status_json_parity(&helper);
    let issues = helper.status_issues_or_known().native();
    assert!(!issues.contains(&"MissingPackagesDependenciesOnFs".into()), "{issues:?}");
}

/// A package absent from `node_modules` is reported as a missing dependency.
#[test]
fn an_uninstalled_package_is_a_missing_dependency() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("bar/foo.js", "require('missing-example-package');");
    helper.add_component_bar_foo();
    status_json_parity(&helper);
    status_text_parity(&helper);
    let issues = helper.status_issues_or_known().native();
    assert!(issues.contains(&"MissingPackagesDependenciesOnFs".into()), "{issues:?}");
}

/// when a component is created and added without its dependencies › Should show missing
/// dependencies
#[test]
fn missing_dependency_files_are_shown() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let comp1 = r#"require("./comp2");require("./comp3");require("./comp4");require("./comp5");require("./comp6");"#;
    helper.output_file("comp1/comp1.js", comp1);
    helper.output_file("comp2/comp2.js", r#"require("./comp4");require("./comp5");"#);
    for name in ["comp3", "comp4", "comp6"] {
        helper.output_file(&format!("{name}/{name}.js"), "");
    }
    helper.output_file("comp5/comp5.js", r#"require("./comp6");"#);
    helper.run("add comp1 -i comp1");
    helper.run("add comp5 -i comp5");
    status_json_parity(&helper);
    status_text_parity(&helper);
    let output = helper.native_or_known("status").native().stdout;
    let indented = [format!("{ISSUE_INDENT}comp1.js"), format!("{ISSUE_INDENT}comp5.js")];
    let expected = [
        "non-existing dependency files",
        "comp1 ... issues found",
        "comp1.js -> ./comp2, ./comp3, ./comp4, ./comp5, ./comp6",
        "comp5.js -> ./comp6",
        "comp5 ... issues found",
        &indented[0],
        &indented[1],
    ];
    for expected in expected {
        assert!(output.contains(expected), "{expected:?} in {output}");
    }
}

/// import from the index file › should show an `ImportFromDirectory` issue
#[test]
fn importing_the_index_directory_is_an_issue() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("comp1/index.ts", "export { hello } from './foo';");
    helper.output_file("comp1/foo.ts", "export const hello = 'world';");
    helper.output_file("comp1/bar.ts", "import { hello } from '.';");
    helper.run("add comp1");
    status_json_parity(&helper);
    status_text_parity(&helper);
    let issues = helper.status_issues_or_known().native();
    assert!(issues.contains(&"ImportFromDirectory".into()), "{issues:?}");
}

/// A tracked component whose directory was deleted still appears in status.
#[test]
fn a_deleted_dependency_directory_does_not_throw() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    helper.run("export");
    helper.delete_path("comp2");
    helper.append_file("comp1/index.js", "\n");
    status_json_parity(&helper);
    status_text_parity(&helper);
}

#[test]
fn an_empty_tracked_directory_is_an_invalid_component() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("bar/foo.js", "module.exports = 1;");
    helper.add_component_bar_foo();
    helper.delete_path("bar/foo.js");
    status_json_parity(&helper);
    status_text_parity(&helper);
}

#[test]
fn a_removed_main_file_with_other_files_is_an_invalid_component() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("bar/foo.js", "module.exports = 1;");
    helper.add_component_bar_foo();
    helper.delete_path("bar/foo.js");
    helper.output_file("bar/other.js", "module.exports = 2;");
    status_json_parity(&helper);
    status_text_parity(&helper);
}

/// Remaining known fallback: `bit show`.
mod known_failures {
    use crate::{
        allow_known_failure,
        helper::{Helper, len, parse},
    };

    /// components that imports itself › should not add itself as a dependency
    #[test]
    fn a_component_importing_itself_is_not_its_own_dependency() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("bar/index.js", r#"export const a = "b";"#);
        let remote = &helper.scopes.remote;
        helper.output_file("bar/foo.js", &format!("import {{ a }} from '@{remote}/bar';"));
        helper.run("add bar");
        helper.run("link");
        let show = allow_known_failure!(helper.native_output_or_known("show bar --json --legacy"));
        assert_eq!(len(&parse(&show)["dependencies"]), 0);
    }
}
