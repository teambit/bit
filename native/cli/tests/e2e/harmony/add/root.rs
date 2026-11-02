//! Workspace-root component tracking and nested ownership tests for `bit add --root` ([`assert_loaded_root_sources`]).
//!
//! Verifies `.bitmap` boundaries, nested component file handoff, collision errors, and skipped dependency detectors.

use crate::{
    commands::add::support::{compare, workspace},
    helper::config,
};
use std::fs;

/// Verifies that tracking `.` with `--root` preserves nested component `.bitmap` ownership and skips root package linking.
#[test]
fn root_tracking_keeps_nested_ownership_bitmap_and_scope_boundaries() {
    let helper = workspace();
    helper.output_file("comp1/index.js", "module.exports=1;\n");
    helper.run("add comp1");
    helper.output_file("README.md", "# workspace root\n");
    let result = compare(&helper, "add . -i ws-root --root");
    assert!(result.status.success(), "{}", result.stderr);
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["ws-root"]["rootDir"], ".");
    assert_eq!(bitmap["comp1"]["rootDir"], "comp1");
    let package =
        helper.scopes.local_path.join(format!("node_modules/@{}/ws-root", helper.scopes.remote));
    assert!(!package.exists());
    helper.output_file("LICENSE", "MIT\n");
    compare(&helper, "add . -i ws-root --root");
    assert_loaded_root_sources(&helper);
}
/// Asserts that `ws-root` tracks `README.md`, `LICENSE`, and `.bitmap` while excluding `comp1/` and `.bit/`.
fn assert_loaded_root_sources(helper: &crate::helper::Helper) {
    let loaded = super::inspection::show(helper, "ws-root");
    let files: Vec<_> = super::inspection::fragment(&loaded, "files")
        .as_array()
        .unwrap()
        .iter()
        .map(|file| file.as_str().unwrap())
        .collect();
    for path in ["README.md", "LICENSE", ".bitmap"] {
        assert!(files.contains(&path), "missing root source {path}");
    }
    assert!(
        !files
            .iter()
            .any(|file| file.starts_with("comp1/")),
    );
    assert!(
        !files
            .iter()
            .any(|file| file.starts_with(".bit/")),
    );
}

/// Verifies that adding a nested component transfers file ownership from an existing `--root` component.
#[test]
fn a_nested_new_component_can_take_files_previously_owned_by_the_root() {
    let helper = workspace();
    helper.output_file("README.md", "# workspace root\n");
    helper.output_file("nested/index.js", "module.exports=1;\n");
    helper.run("add . -i ws-root --root");
    compare(&helper, "add nested -i nested/member");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["ws-root"]["rootDir"], ".");
    assert_eq!(bitmap["nested/member"]["rootDir"], "nested");
    assert!(fs::read(helper.scopes.local_path.join("nested/index.js")).is_ok());
}
/// Verifies that missing or reserved root component IDs and duplicate `--root` registrations match `Node.js` errors ([`compare`]).
#[test]
fn root_flag_id_and_existing_root_collisions_match_node() {
    for command in ["add . --root", "add comp1 -i root --root", "add . -i second-root --root"] {
        let helper = workspace();
        helper.output_file("README.md", "# workspace root\n");
        helper.output_file("comp1/index.js", "module.exports=1;\n");
        if command.contains("second-root") {
            helper.run("add . -i ws-root --root");
        }
        compare(&helper, command);
    }
}

/// Verifies that workspace-root sources do not trigger dependency detectors or policy callbacks during `bit add --root` ([`workspace`]).
#[test]
fn root_sources_do_not_invoke_dependency_detectors_or_policy_callbacks() {
    let helper = workspace();
    helper.output_file("nested/index.js", "module.exports=1;\n");
    helper.run("add nested -i nested/member");
    helper.output_file(
        "index.js",
        "require('missing-root-package'); require('./nested'); module.exports=1;\n",
    );
    helper.output_file("README.md", "# root\n```js\nrequire('missing-markdown-package');\n```\n");
    helper.output_file("root.jsonc", "{ // a root source\n  \"missing-root-package\": true\n}\n");
    let result = compare(&helper, "add . -i ws-root --root");
    assert!(result.status.success(), "{}", result.stderr);
    for callback in
        ["host parseDependencies", "host detectDependencies", "host dependencyPolicyCached"]
    {
        assert!(!result.trace.contains(callback), "{callback}: {}", result.trace);
    }
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["ws-root"]["rootDir"], ".");
    assert_eq!(bitmap["nested/member"]["rootDir"], "nested");
}
