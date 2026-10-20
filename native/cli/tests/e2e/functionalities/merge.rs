//! `e2e/functionalities/merge.e2e.ts`.

use crate::helper::{Helper, config, parse, remote};
use std::fs;

const IS_TYPE_V1: &str = "module.exports = function isType() { return 'got is-type v1'; };";
const IS_TYPE_V2: &str = "module.exports = function isType() { return 'got is-type v2'; };";
const IS_TYPE_V3: &str = "module.exports = function isType() { return 'got is-type v3'; };";

/// merge functionality › re-exporting/importing an existing version
#[test]
fn re_exporting_and_importing_an_existing_version() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();

    helper.output_file("bar2/foo2.js", "module.exports = 'foo2';");
    helper.run("add bar2 -i bar2/foo2");
    helper.tag_without_build("bar2/foo2", "");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/bar/foo", helper.scopes.remote));
    helper.native(&format!("import {}/bar2/foo2", helper.scopes.remote));
    let scope_with_v1 = helper.clone_workspace();

    helper.tag_without_build("bar/foo", "--unmodified");
    helper.tag_without_build("bar2/foo2", "--unmodified");
    remote::publish(&helper);

    helper.get_cloned_workspace(&scope_with_v1);
    helper.tag_without_build("bar/foo", "--unmodified");
    helper.tag_without_build("bar2/foo2", "--unmodified");

    let export_err = helper.cmd("export");
    assert!(!export_err.status.success());
    let export_combined = format!("{}{}", export_err.stdout, export_err.stderr);
    assert!(export_combined.contains("0.0.2"), "{export_combined}");

    let import_err = helper.cmd(&format!("import {}/bar/foo", helper.scopes.remote));
    assert!(!import_err.status.success());
    let import_combined = format!("{}{}", import_err.stdout, import_err.stderr);
    assert!(import_combined.contains("0.0.2"), "{import_combined}");
    assert!(!import_combined.contains("unhandled rejection found"));
}

/// merge functionality › importing a component with --merge flag
#[test]
fn importing_a_component_with_merge_flag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.output_file("comp2/is-type.js", IS_TYPE_V1);
    helper.run("tag --message v1");
    helper.output_file("comp2/is-type.js", IS_TYPE_V2);
    helper.run("tag --message v2");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    let before_import = helper.clone_workspace();
    helper.native(&format!("import {}/comp2@0.0.1 --path components/comp2", helper.scopes.remote));

    let invalid = helper.cmd(&format!("import {}/comp2 --merge=invalid", helper.scopes.remote));
    assert!(!invalid.status.success());
    let invalid_combined = format!("{}{}", invalid.stdout, invalid.stderr);
    assert!(invalid_combined.contains("merge must be one of the following"), "{invalid_combined}");

    helper.output_file("components/comp2/is-type.js", IS_TYPE_V3);
    let local_scope = helper.clone_workspace();

    // strategy=manual (conflict)
    let out_manual =
        helper.native(&format!("import {}/comp2 --merge=manual", helper.scopes.remote));
    assert!(out_manual.contains("conflicts"));
    let content_manual =
        fs::read_to_string(helper.scopes.local_path.join("components/comp2/is-type.js")).unwrap();
    assert!(content_manual.contains("<<<<<<< 0.0.1 modified"));
    assert!(content_manual.contains("======="));
    assert!(content_manual.contains(">>>>>>> 0.0.2"));
    let status_manual = helper.native("status");
    assert!(status_manual.contains("modified components"));
    let bitmap_manual = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap_manual["comp2"]["version"].as_str(), Some("0.0.2"));

    // strategy=theirs
    helper.get_cloned_workspace(&local_scope);
    let out_theirs =
        helper.native(&format!("import {}/comp2 --merge=theirs", helper.scopes.remote));
    assert!(!out_theirs.contains("conflicts"));
    let content_theirs =
        fs::read_to_string(helper.scopes.local_path.join("components/comp2/is-type.js")).unwrap();
    assert!(content_theirs.contains(IS_TYPE_V2));
    let status_theirs = helper.native("status");
    assert!(!status_theirs.contains("modified components"));
    let bitmap_theirs = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap_theirs["comp2"]["version"].as_str(), Some("0.0.2"));

    // strategy=ours
    helper.get_cloned_workspace(&local_scope);
    let out_ours = helper.native(&format!("import {}/comp2 --merge=ours", helper.scopes.remote));
    assert!(!out_ours.contains("conflicts"));
    let content_ours =
        fs::read_to_string(helper.scopes.local_path.join("components/comp2/is-type.js")).unwrap();
    assert!(content_ours.contains(IS_TYPE_V3));
    let status_ours = helper.native("status");
    assert!(status_ours.contains("modified components"));
    let bitmap_ours = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap_ours["comp2"]["version"].as_str(), Some("0.0.2"));

    // modifying component to match incoming version -> manual succeeds without conflict
    helper.get_cloned_workspace(&local_scope);
    helper.output_file("components/comp2/is-type.js", IS_TYPE_V2);
    let out_same = helper.native(&format!("import {}/comp2 --merge=manual", helper.scopes.remote));
    assert!(!out_same.contains("conflicts"));
    let content_same =
        fs::read_to_string(helper.scopes.local_path.join("components/comp2/is-type.js")).unwrap();
    assert!(content_same.contains(IS_TYPE_V2));
    let status_same = helper.native("status");
    assert!(!status_same.contains("modified components"));

    // modifying dependency then import --merge of dependent
    helper.get_cloned_workspace(&before_import);
    helper.native(&format!("import {}/comp2 --path components/comp2", helper.scopes.remote));
    helper.native(&format!("import {}/comp1 --path components/comp1", helper.scopes.remote));
    helper.output_file("components/comp2/is-type.js", IS_TYPE_V3);
    helper.run(&format!("import {}/comp1 --merge", helper.scopes.remote));
    let dep_content =
        fs::read_to_string(helper.scopes.local_path.join("components/comp2/is-type.js")).unwrap();
    assert_eq!(dep_content, IS_TYPE_V3);
    let status_json = parse(&helper.native("status --json"));
    assert!(
        status_json["modifiedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|id| id
                .as_str()
                .is_some_and(|s| s.contains("comp2"))),
    );
}
