//! `MergeStatusProvider` removal policy and hidden lane publication match Bit 2.2.94.
mod cascade;
mod hidden_pending;

use crate::helper::{Helper, config};
use std::{collections::BTreeMap, ffi::OsStr, fs, path::Path};

fn removed_lane() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_without_build("", "--message first");
    crate::helper::remote::publish(&helper);
    helper.native("lane create incoming-removal");
    helper.native("delete comp1 --update-main --silent");
    helper.run("snap --message removed");
    helper.run("switch main --skip-fetch -x");
    helper
}

fn stable(text: &str) -> String {
    text.lines()
        .map(|line| {
            line.split_once("(completed in")
                .map_or_else(
                    || line.to_owned(),
                    |(prefix, _)| format!("{prefix}(completed in <duration>)"),
                )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn workspace_files(root: &Path, directory: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
    for entry in fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        let relative = path.strip_prefix(root).unwrap();
        if [".bit", ".git", "node_modules"]
            .iter()
            .any(|excluded| relative.starts_with(excluded))
        {
            continue;
        }
        if path.is_dir() {
            workspace_files(root, &path, files);
        } else {
            files.insert(relative.to_string_lossy().into_owned(), fs::read(path).unwrap());
        }
    }
}

fn files(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut files = BTreeMap::new();
    workspace_files(root, root, &mut files);
    files
}

fn compare(helper: &Helper, command: &str) {
    let oracle = helper.clone_workspace();
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(stable(&native.stdout), stable(&node.stdout));
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
    assert_eq!(helper.scopes.local_path.join("comp1").exists(), oracle.join("comp1").exists());
    compare_files(&helper.scopes.local_path, &oracle);
    compare_model(helper, &oracle);
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let oracle_scope = bit_object_import::scope_path(&oracle);
    assert_eq!(
        fs::read(scope.join("unmerged.json")).ok(),
        fs::read(oracle_scope.join("unmerged.json")).ok(),
    );
}

fn compare_files(root: &Path, oracle: &Path) {
    let actual = files(root);
    let expected = files(oracle);
    assert_eq!(actual.keys().collect::<Vec<_>>(), expected.keys().collect::<Vec<_>>());
    for (path, bytes) in actual {
        assert!(
            bytes == expected[&path],
            "{path}: actual {:?}, expected {:?}",
            String::from_utf8_lossy(&bytes),
            String::from_utf8_lossy(&expected[&path]),
        );
    }
}

fn compare_model(helper: &Helper, oracle: &Path) {
    let command = format!("cat-component {}/comp1 --json", helper.scopes.remote);
    let actual = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let expected = Helper::cmd_in_with(oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    if actual.stdout.is_empty() || expected.stdout.is_empty() {
        assert_eq!(actual.status.code(), expected.status.code());
        compare_objects(&helper.scopes.local_path, oracle);
    } else {
        assert_eq!(crate::helper::parse(&actual.stdout), crate::helper::parse(&expected.stdout));
    }
}

#[test]
fn removed_fast_forward_lane_merge_matches_node() {
    let helper = removed_lane();
    compare(&helper, "lane merge incoming-removal --no-squash -x");
}

#[test]
fn removed_no_snap_lane_merge_matches_node() {
    let helper = removed_lane();
    compare(&helper, "lane merge incoming-removal --no-squash --no-snap -x");
}

fn removed_main(mark_main: bool, diverged: bool) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_without_build("", "--message first");
    crate::helper::remote::publish(&helper);
    let baseline = helper.clone_workspace();
    helper.native("delete comp1 --silent");
    if mark_main {
        let path = helper.scopes.local_path.join(".bitmap");
        let mut bitmap = config::read_jsonc(&path);
        bitmap["comp1"]["config"]["teambit.component/remove"]["removeOnMain"] =
            serde_json::json!(true);
        config::write_json(&path, &bitmap, b"    ");
    }
    helper.tag_without_build("", "--message removed");
    crate::helper::remote::publish(&helper);
    helper.get_cloned_workspace(&baseline);
    if diverged {
        helper.append_file("comp1/index.js", "\n// local branch\n");
        helper.native("tag comp1@0.0.3 --message local");
    }
    helper.native(&format!("fetch -c {}/comp1", helper.scopes.remote));
    helper
}

#[test]
fn removed_component_merge_preserves_main_removal_policy() {
    for marked in [false, true] {
        let helper = removed_main(marked, false);
        compare(&helper, "merge comp1 --no-snap -x");
    }
}

#[test]
fn diverged_removed_component_merge_keeps_pending_configuration() {
    let helper = removed_main(true, true);
    compare(&helper, "merge comp1 --no-snap -x");
}

fn hidden_workspace() -> (Helper, std::path::PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "--message first");
    crate::helper::remote::publish(&helper);
    let main = helper.clone_workspace();
    helper.native("lane create hidden-policy");
    helper.native("snap comp2 --skip-auto-snap --unmodified --message lane");
    crate::helper::remote::publish(&helper);
    helper.seed_hidden_update_dependent(
        &format!("{}/comp1", helper.scopes.remote),
        &format!("{}/hidden-policy", helper.scopes.remote),
    );
    (helper, main)
}

#[test]
fn hidden_lane_merge_preserves_scope_configuration_without_workspace_files() {
    let (helper, main) = hidden_workspace();
    helper.get_cloned_workspace(&main);
    helper.append_file("comp1/index.js", "\n// main branch\n");
    helper.output_file(
        "comp1/component.json",
        &serde_json::json!({
            "componentId":{"scope":helper.scopes.remote,"name":"comp1"},
            "extensions":{"teambit.pkg/pkg":{"packageJson":{"scopeMergeMetadata":"incoming"}}}
        })
        .to_string(),
    );
    helper.tag_without_build("comp1", "--message main-change");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/hidden-policy -x", helper.scopes.remote));
    helper.native(&format!("import {}/comp2 -x", helper.scopes.remote));
    compare(&helper, "lane merge main --no-auto-snap -x");
}

fn package(helper: &Helper, version: &str) {
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        serde_json::json!({"policy":{"dependencies":{"lodash.get":version}}}),
    );
    helper.output_file(
        "node_modules/lodash.get/package.json",
        &serde_json::json!({"name":"lodash.get","version":version,"main":"index.js"}).to_string(),
    );
    helper.output_file("node_modules/lodash.get/index.js", "module.exports = () => 1;\n");
}

fn workspace_policy(current: &str) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/index.js", "module.exports = require('lodash.get');\n");
    package(&helper, "4.4.1");
    helper.tag_without_build("", "--message first");
    crate::helper::remote::publish(&helper);
    helper.native("lane create policy-update");
    package(&helper, "4.4.2");
    helper.native("snap comp1 --message incoming");
    helper.native("switch main --skip-fetch -x");
    package(&helper, current);
    helper.append_file("comp1/index.js", "\n// current branch\n");
    helper.native("snap comp1 --message current");
    let path = helper.scopes.local_path.join("workspace.jsonc");
    fs::write(&path, format!("// retain policy comment\n{}", fs::read_to_string(&path).unwrap()))
        .unwrap();
    helper
}

#[test]
fn lane_merge_updates_workspace_dependency_policy_without_losing_comments() {
    compare(&workspace_policy("4.4.1"), "lane merge policy-update --no-squash --no-auto-snap -x");
}

#[test]
fn lane_merge_moves_shared_dependency_conflicts_to_workspace_policy() {
    let helper = workspace_policy("4.4.3");
    compare(&helper, "lane merge policy-update --no-squash --no-auto-snap -x");
    assert!(
        fs::read_to_string(helper.scopes.local_path.join("workspace.jsonc"))
            .unwrap()
            .contains("<<<<<<<"),
    );
    assert!(!helper.scopes.local_path.join("merge-conflict").exists());
}

#[test]
fn lane_merge_materializes_component_configuration_conflicts() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let set = |value: &str| {
        helper.output_file(
            "comp1/component.json",
            &serde_json::json!({
        "componentId":{"scope":helper.scopes.remote,"name":"comp1"},
        "extensions":{"teambit.pkg/pkg":{"packageJson":{"configConflict":value}}}})
            .to_string(),
        );
    };
    set("base");
    helper.tag_without_build("", "--message first");
    crate::helper::remote::publish(&helper);
    helper.native("lane create configuration-conflict");
    set("incoming");
    helper.native("snap comp1 --message incoming");
    helper.native("switch main --skip-fetch -x");
    set("current");
    helper.native("snap comp1 --message current");
    compare(&helper, "lane merge configuration-conflict --no-squash --no-auto-snap -x");
}

#[test]
fn lane_merge_retains_dependency_conflicts_outside_workspace_policy() {
    let helper = workspace_policy("4.4.3");
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        serde_json::json!({"policy":{}}),
    );
    compare(&helper, "lane merge policy-update --no-squash --no-auto-snap -x");
    let conflict = fs::read_to_string(helper.scopes.local_path.join("merge-conflict")).unwrap();
    assert!(conflict.contains("4.4.3"));
    assert!(conflict.contains("4.4.2"));
}

fn compare_objects(root: &Path, oracle: &Path) {
    let mut actual_objects = BTreeMap::new();
    let mut expected_objects = BTreeMap::new();
    let scope = bit_object_import::scope_path(root);
    let expected_scope = bit_object_import::scope_path(oracle);
    workspace_files(&scope, &scope.join("objects"), &mut actual_objects);
    workspace_files(&expected_scope, &expected_scope.join("objects"), &mut expected_objects);
    assert_eq!(
        actual_objects.keys().collect::<Vec<_>>(),
        expected_objects.keys().collect::<Vec<_>>(),
    );
    for (name, bytes) in actual_objects {
        assert_eq!(object_bytes(&bytes), object_bytes(&expected_objects[&name]), "{name}");
    }
}

fn object_bytes(bytes: &[u8]) -> Vec<u8> {
    use std::io::Read;
    let mut output = Vec::new();
    if flate2::read::ZlibDecoder::new(bytes).read_to_end(&mut output).is_ok() {
        output
    } else {
        bytes.to_vec()
    }
}
