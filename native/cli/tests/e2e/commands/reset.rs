//! `e2e/commands/reset.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, Run, parse};
use serde_json::Value;
use std::{fs, path::PathBuf};

/// `fixtures.isStringHarmony`.
const IS_STRING: &str = "const isType = require('../is-type/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";

/// `catComponent(id)`.
fn cat_component(helper: &Helper, id: &str) -> Value {
    parse(&helper.run(&format!("cat-component {id} --json")))
}

/// `listLocalScope()`.
fn list_local_scope(helper: &Helper) -> String {
    helper.run("list --local-scope")
}

/// `bitMap.read()`: `.bitmap` without its leading comment.
fn read_bitmap(helper: &Helper) -> Value {
    let text = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    parse(&text[text.find('{').unwrap()..])
}

/// `showAspectConfig(id, aspect)`.
fn aspect_config(helper: &Helper, id: &str, aspect: &str) -> Value {
    let show = parse(&helper.run(&format!("show {id} --json")));
    let configuration = show
        .as_array()
        .unwrap()
        .iter()
        .find(|section| section["title"] == "configuration")
        .unwrap();
    let entries = configuration["json"].as_array().unwrap();
    entries
        .iter()
        .find(|entry| entry["id"] == aspect)
        .unwrap()
        .clone()
}

/// `isDeprecated(id)`.
fn is_deprecated(helper: &Helper, id: &str) -> bool {
    aspect_config(helper, id, "teambit.component/deprecation")["config"]["deprecate"] == true
}

/// A failed run's stdout and stderr, as `execSync`'s error message carries them.
fn failure_output(run: &Run) -> String {
    assert!(!run.status.success(), "succeeded: {}", run.stdout);
    format!("{}\n{}", run.stdout, run.stderr)
}

/// `snapAllComponentsWithoutBuild(options)`.
fn snap_all(helper: &Helper, options: &str) {
    let output = helper.run(&format!("snap {options}"));
    assert!(!output.contains("nothing to snap"), "{output}");
}

/// untag single component: bar/foo tagged once, and a copy of that workspace.
fn single_component() -> (Helper, PathBuf) {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    let local_scope = helper.clone_workspace();
    assert!(list_local_scope(&helper).contains("found 1 components"));
    (helper, local_scope)
}

/// untag single component, from the copy, tagged a second time.
fn single_component_tagged_twice() -> Helper {
    let (helper, local_scope) = single_component();
    helper.get_cloned_workspace(&local_scope);
    helper.tag_without_build("bar/foo", "--unmodified");
    assert!(cat_component(&helper, "bar/foo")["versions"].get("0.0.2").is_some());
    helper
}

/// untag multiple components (--all flag): three components, bar/foo3 exported.
fn three_components() -> (Helper, PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.output_file("bar2/foo2.js", FOO_FIXTURE);
    helper.run("add bar2 -i bar/foo2");
    helper.output_file("bar3/foo3.js", FOO_FIXTURE);
    helper.run("add bar3 -i bar/foo3");
    helper.run("tag");
    helper.run("export bar/foo3");
    let local_scope = helper.clone_workspace();
    assert!(list_local_scope(&helper).contains("found 3 components"));
    (helper, local_scope)
}

/// untag multiple components (--all flag) › without specifying a version › should display
/// a descriptive successful message; should remove only local components from the model
#[test]
fn reset_all_removes_only_local_components() {
    let (helper, _) = three_components();
    let output = helper.native("reset --silent");
    assert!(output.contains("2 component(s) reset successfully"), "{output}");
    let list = list_local_scope(&helper);
    assert!(list.contains("found 1 components") && list.contains("bar/foo3"), "{list}");
}

/// untag multiple components (--all flag) › with --head › should display a descriptive
/// successful message; should remove only the specified version from the model
#[test]
fn reset_all_head_removes_only_the_head() {
    let (helper, local_scope) = three_components();
    helper.get_cloned_workspace(&local_scope);
    helper.run("tag --unmodified --ver 0.0.5");
    let output = helper.native("reset --head --silent");
    assert!(output.contains("3 component(s) reset successfully"), "{output}");
    let list = list_local_scope(&helper);
    assert!(list.contains("found 3 components") && list.contains("0.0.1"), "{list}");
    assert!(!list.contains("0.0.5"), "{list}");
}

/// components with dependencies: utils/is-string requires utils/is-type, both tagged.
fn with_dependencies() -> (Helper, PathBuf) {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("is-type/is-type.js", FOO_FIXTURE);
    helper.run("add is-type -i utils/is-type");
    helper.output_file("is-string/is-string.js", IS_STRING);
    helper.run("add is-string -i utils/is-string");
    helper.run("link --rewire");
    helper.run("tag");
    let local_scope = helper.clone_workspace();
    (helper, local_scope)
}

/// components with dependencies › untag all components › when all components have only
/// local versions › should remove all the components because it does not leave a damaged
/// component without dependency
#[test]
fn reset_all_of_local_dependencies_removes_all() {
    let (helper, local_scope) = with_dependencies();
    helper.get_cloned_workspace(&local_scope);
    helper.native("reset --silent");
    assert!(list_local_scope(&helper).contains("found 0 components"));
}

/// components with dependencies › after import and tagging: utils/is-string imported to
/// another workspace, and a copy of it before the tag.
fn imported_and_tagged() -> (Helper, PathBuf) {
    let (helper, local_scope) = with_dependencies();
    helper.get_cloned_workspace(&local_scope);
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    helper.run("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    let remote = &helper.scopes.remote;
    helper.run(&format!("import {remote}/utils/is-string --path components/utils/is-string"));
    let after_import = helper.clone_workspace();
    helper.tag_without_build("utils/is-string", r#"--unmodified --ignore-issues "*""#);
    (helper, after_import)
}

/// components with dependencies › after import and tagging › modify, tag and then untag
/// all › should show the component as modified
#[test]
fn reset_all_keeps_the_modification() {
    let (helper, after_import) = imported_and_tagged();
    helper.get_cloned_workspace(&after_import);
    let path = "components/utils/is-string/is-string.js";
    let content = fs::read_to_string(helper.scopes.local_path.join(path)).unwrap();
    helper.output_file(path, &format!("\n{content}"));
    helper.run(r#"tag --ignore-issues "*""#);
    helper.native("reset --silent");
    let status = helper.run("status");
    assert!(!status.contains("no modified components"), "{status}");
    assert!(status.contains("modified components") && status.contains("utils/is-string"));
}

/// components with config in the .bitmap file › bit reset should leave the config as they
/// were before the tag; bit export should remove the entries form the staged-config file
#[test]
fn reset_keeps_the_bitmap_config() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag");
    helper.run("deprecate comp1");
    helper.run("tag");
    assert!(is_deprecated(&helper, "comp1"));
    helper.native("reset --silent");
    assert!(is_deprecated(&helper, "comp1"));
    helper.run("tag --unmodified");
    helper.run("export");
    let staged = helper.scopes.local_path.join(".bit/staged-config/main.json");
    let staged: Value = parse(&fs::read_to_string(staged).unwrap());
    assert_eq!(crate::helper::len(&staged), 0);
}

/// components with env config after multiple snaps: comp1 on the react env, snapped, then
/// `between` run, snapped again, and reset.
fn env_after_snaps(between: &str) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    crate::helper::config::set_component_env(
        &helper.scopes.local_path,
        "comp1",
        "teambit.react/react",
    );
    snap_all(&helper, "");
    if between.is_empty() {
        snap_all(&helper, "--unmodified");
    } else {
        if let Some(env) = between.strip_prefix("envs set comp1 ") {
            crate::helper::config::set_component_env(&helper.scopes.local_path, "comp1", env);
        } else {
            helper.run(between);
        }
        snap_all(&helper, "");
    }
    helper
}

fn env_of_comp1(helper: &Helper) -> Value {
    aspect_config(helper, "comp1", "teambit.envs/envs")["config"]["env"].clone()
}

/// components with env config after multiple snaps › when env is not changed between snaps
/// › bit reset should restore the env config that was set before the first snap
#[test]
fn reset_restores_the_env_of_the_first_snap() {
    let helper = env_after_snaps("");
    helper.native("reset --silent");
    assert_eq!(env_of_comp1(&helper), "teambit.react/react");
}

/// components with env config after multiple snaps › when env is changed between snaps ›
/// bit reset should keep the latest env config (not revert to the first snap env)
#[test]
fn reset_keeps_the_latest_env() {
    let helper = env_after_snaps("envs set comp1 teambit.harmony/node");
    helper.native("reset --silent");
    assert_eq!(env_of_comp1(&helper), "teambit.harmony/node");
}

/// components with env config after multiple snaps › when a different config (deps) is
/// changed between snaps but env stays the same › bit reset should restore both the env
/// and the deps config
#[test]
fn reset_restores_the_env_after_a_deps_change() {
    let helper = env_after_snaps("dependencies set comp1 lodash@4.17.21");
    helper.native("reset --silent");
    assert_eq!(env_of_comp1(&helper), "teambit.react/react");
}

/// Single-component reset of the only local tag removes its model entry.
#[test]
fn reset_head_of_a_single_version_deletes_the_component() {
    let (helper, _) = single_component();
    helper.native("reset bar/foo --head");
    assert!(list_local_scope(&helper).contains("found 0 components"));
}

/// Resetting only the latest local tag preserves the older tag and staged status.
#[test]
fn reset_head_deletes_only_the_head_tag() {
    let helper = single_component_tagged_twice();
    helper.native("reset bar/foo --head");
    let cat = cat_component(&helper, "bar/foo");
    for versions in [&cat["versions"], &cat["state"]["versions"]] {
        assert!(versions.get("0.0.2").is_none(), "{versions}");
        assert!(versions.get("0.0.1").is_some(), "{versions}");
    }
    let show = parse(&helper.run("show bar/foo --json --legacy"));
    assert_eq!(show["name"], "bar/foo");
    assert!(helper.run("status").contains("staged components"));
}

/// Resetting all local tags removes the component from the scope index.
#[test]
fn reset_of_local_versions_deletes_the_component() {
    let helper = single_component_tagged_twice();
    helper.native("reset bar/foo");
    assert!(list_local_scope(&helper).contains("found 0 components"));
}

/// Resetting local tags preserves an exported tag.
#[test]
fn reset_keeps_the_exported_tag() {
    let (helper, local_scope) = single_component();
    helper.get_cloned_workspace(&local_scope);
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    helper.run("export");
    helper.tag_without_build("bar/foo", "--unmodified");
    assert!(cat_component(&helper, "bar/foo")["versions"].get("0.0.2").is_some());
    helper.native("reset bar/foo");
    let versions = &cat_component(&helper, "bar/foo")["versions"];
    assert!(versions.get("0.0.2").is_none(), "{versions}");
    assert!(versions.get("0.0.1").is_some(), "{versions}");
}

/// Resetting the dependent preserves its dependency.
#[test]
fn reset_of_the_dependent_keeps_the_dependency() {
    let (helper, local_scope) = with_dependencies();
    helper.get_cloned_workspace(&local_scope);
    let output = helper.native("reset utils/is-string");
    assert!(output.contains("1 component(s) reset successfully"), "{output}");
    assert!(output.contains("utils/is-string"), "{output}");
    assert!(list_local_scope(&helper).contains("utils/is-type"));
}

/// Reset accepts the unscoped workspace id of an imported component.
#[test]
fn reset_by_an_id_without_scope() {
    let (helper, _) = imported_and_tagged();
    let output = helper.native("reset utils/is-string");
    assert!(output.contains("1 component(s) reset successfully"), "{output}");
    assert!(output.contains("utils/is-string"), "{output}");
}

/// untag single component › when tagging non-existing component › should show an
/// descriptive error
#[test]
fn reset_of_a_missing_component_fails() {
    let (helper, _) = single_component();
    let output = failure_output(&helper.native_run("reset non-exist-scope/non-exist-comp"));
    let expected = r#"error: component "non-exist-scope/non-exist-comp" was not found on your local workspace."#;
    assert!(output.contains(expected), "{output}");
}

/// components with dependencies › untag only the dependency › without force flag › should
/// throw a descriptive error; with force flag › should untag successfully
#[test]
fn reset_of_a_dependency_needs_force() {
    let (helper, _) = with_dependencies();
    let remote = &helper.scopes.remote;
    let output = failure_output(&helper.native_run("reset utils/is-type"));
    let expected = format!(
        "unable to reset {remote}/utils/is-type, the version 0.0.1 has the following dependent(s) {remote}/utils/is-string@0.0.1",
    );
    assert!(output.contains(&expected), "{output}");
    let output = helper.native("reset utils/is-type --force");
    assert!(output.contains("1 component(s) reset successfully"), "{output}");
}

/// components with dependencies › untag only the dependency › after exporting the
/// component and tagging the scope › should show an error
#[test]
fn reset_of_an_exported_dependency_fails() {
    let (helper, local_scope) = with_dependencies();
    helper.get_cloned_workspace(&local_scope);
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    helper.run("export");
    helper.run("tag --unmodified --ver 1.0.5");
    let run = helper.native_run("reset utils/is-type");
    let output = format!("{}\n{}", run.stdout, run.stderr);
    let expected = format!("unable to reset {}/utils/is-type", helper.scopes.remote);
    assert!(output.contains(&expected), "{output}");
}

/// when checked out to a non-head version with detach-head functionality › expect .bitmap
/// to point to the same version as it was before the reset, and not the latest; should
/// not show the component as modified; should clear the detached head
#[test]
fn reset_of_a_detached_head() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for version in ["", "version2", "version3"] {
        helper.populate_components(1, false, version);
        helper.run("tag");
    }
    helper.run("export");
    helper.run("checkout 0.0.2 comp1 -x");
    helper.run("snap comp1 --unmodified --detach-head");
    let comp = cat_component(&helper, "comp1");
    assert!(!comp["detachedHeads"]["current"].is_null(), "{comp}");
    helper.native("reset --silent");
    assert_eq!(read_bitmap(&helper)["comp1"]["version"], "0.0.2");
    let status = parse(&helper.run("status --json"));
    assert_eq!(crate::helper::len(&status["modifiedComponents"]), 0);
    assert!(cat_component(&helper, "comp1").get("detachedHeads").is_none());
}
