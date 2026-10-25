//! E2E tests for dependency graphs, capsules, cyclic isolation, and global virtual store:
//! - `e2e/harmony/deps-graph.e2e.ts`
//! - `e2e/harmony/deps-graph-isolation.e2e.ts`
//! - `e2e/harmony/deps-graph-reimport.e2e.ts`
//! - `e2e/harmony/deps-in-capsules.e2e.ts`
//! - `e2e/harmony/global-virtual-store.e2e.ts`
//! - `e2e/harmony/isolate-cyclic-deps.e2e.ts`

use crate::helper::{Helper, config, parse};
use serde_json::{Value, json};
use std::{ffi::OsStr, fs};

#[test]
fn deps_debug_duplicate_runtime_dev_plus_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-positive": "+"}, "devDependencies": {"is-positive": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_runtime_plus_and_policy_with_peer_plus_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-odd": "1.0.0", "is-positive": "+"}, "peerDependencies": {"is-even": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    compare_debug_with_node(&helper);
    helper.native("tag --skip-tests");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_multiple_plus_with_peer_plus_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-odd": "+"}, "devDependencies": {"is-even": "+"}, "peerDependencies": {"is-positive": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    compare_debug_with_node(&helper);
    helper.native("tag --skip-tests");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_runtime_plus_with_peer_plus_matches_node() {
    compare_debug_plus_fields("dependencies");
}

#[test]
fn deps_debug_dev_plus_with_peer_plus_matches_node() {
    compare_debug_plus_fields("devDependencies");
}

fn compare_debug_plus_fields(field: &str) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = format!(
        r#""rootDir": "comp1", "config": {{"teambit.dependencies/dependency-resolver": {{"policy": {{"{field}": {{"is-odd": "+"}}, "peerDependencies": {{"is-positive": "+"}}}}}}}}"#,
    );
    fs::write(bitmap_path, bitmap.replace(marker, &replacement)).unwrap();
    compare_debug_with_node(&helper);
    helper.native("tag --skip-tests");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_peer_plus_with_runtime_and_dev_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-odd": "1.0.0"}, "devDependencies": {"is-even": "1.0.0"}, "peerDependencies": {"is-positive": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    compare_debug_with_node(&helper);
    helper.native("tag --skip-tests");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_peer_plus_with_peer_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"peerDependencies": {"is-odd": "1.0.0", "is-positive": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    compare_debug_with_node(&helper);
    helper.native("tag --skip-tests");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_peer_plus_with_dev_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"devDependencies": {"is-odd": "1.0.0"}, "peerDependencies": {"is-positive": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    compare_debug_with_node(&helper);
    helper.native("tag --skip-tests");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_peer_plus_with_runtime_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-odd": "1.0.0"}, "peerDependencies": {"is-positive": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    compare_debug_with_node(&helper);
    helper.native("tag --skip-tests");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_tagged_unresolved_dev_plus_matches_node() {
    compare_debug_plus_policy("devDependencies");
}

#[test]
fn deps_debug_tagged_unresolved_peer_plus_matches_node() {
    compare_debug_plus_policy("peerDependencies");
}

fn compare_debug_plus_policy(field: &str) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = format!(
        r#""rootDir": "comp1", "config": {{"teambit.dependencies/dependency-resolver": {{"policy": {{"{field}": {{"is-positive": "+"}}}}}}}}"#,
    );
    fs::write(bitmap_path, bitmap.replace(marker, &replacement)).unwrap();
    compare_debug_with_node(&helper);
    helper.native("tag --skip-tests");
    compare_debug_with_node(&helper);
}

fn compare_debug_with_node(helper: &Helper) {
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_tagged_unresolved_plus_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-positive": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_tagged_ignored_unresolved_name_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-positive": "-"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}
#[test]
fn deps_debug_tagged_ignored_env_matches_node() {
    for entries in [
        r#""@types/jest": "-""#,
        r#""@types/node": "-""#,
        r#""@types/jest": "-", "@types/node": "-""#,
    ] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(1, true, "");
        let bitmap_path = helper.scopes.local_path.join(".bitmap");
        let bitmap = fs::read_to_string(&bitmap_path).unwrap();
        let marker = r#""rootDir": "comp1""#;
        let replacement = format!(
            r#""rootDir": "comp1", "config": {{"teambit.dependencies/dependency-resolver": {{"policy": {{"devDependencies": {{{entries}}}}}}}}}"#,
        );
        fs::write(bitmap_path, bitmap.replace(marker, &replacement)).unwrap();
        helper.native("tag --skip-tests");
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            "deps debug comp1",
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run("deps debug comp1");
        assert!(node.status.success(), "{node:?}");
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}
#[test]
fn deps_debug_tagged_optional_runtime_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 --optional is-positive@3.1.0");
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_tagged_optional_dev_matches_node() {
    compare_tagged_optional("--dev --optional is-odd@3.0.1");
}

#[test]
fn deps_debug_tagged_optional_peer_matches_node() {
    compare_tagged_optional("--peer --optional is-positive@3.1.0");
}

fn compare_tagged_optional(spec: &str) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native(&format!("deps set comp1 {spec}"));
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}
#[test]
fn deps_debug_plain_tagged_react_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.react/react");
    helper.tag_without_build("", "");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_plain_snapped_react_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.react/react");
    helper.native("snap --unmodified");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_plain_tagged_node_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_tagged_dev_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 --dev yargs-parser@21.1.1");
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success());
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_tagged_runtime_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 lodash@4.17.21");
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_tagged_peer_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 --peer react@^19.0.0");
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_tagged_mixed_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 lodash@4.17.21");
    helper.native("deps set comp1 --dev yargs-parser@21.1.1");
    helper.native("deps set comp1 --peer react@^19.0.0");
    helper.native("tag --skip-tests");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_policy_added_after_tag_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag --skip-tests");
    helper.native("deps set comp1 --dev yargs-parser@21.1.1");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_saved_and_post_tag_policies_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 --dev yargs-parser@21.1.1");
    helper.native("tag --skip-tests");
    helper.native("deps set comp1 lodash@4.17.21");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_saved_plus_and_post_tag_policy_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"devDependencies": {"is-positive": "+"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    helper.native("tag --skip-tests");
    helper.native("deps set comp1 lodash@4.17.21");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_saved_ignored_and_post_tag_policy_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    let replacement = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"devDependencies": {"@types/jest": "-"}}}}"#;
    fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
    helper.native("tag --skip-tests");
    helper.native("deps set comp1 lodash@4.17.21");
    compare_debug_with_node(&helper);
}

#[test]
fn deps_debug_plus_duplicate_dev_policy_matches_node() {
    compare_plus_duplicate_policy("devDependencies");
}

#[test]
fn deps_debug_plus_duplicate_peer_policy_matches_node() {
    compare_plus_duplicate_policy("peerDependencies");
}

fn compare_plus_duplicate_policy(field: &str) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    let policy = r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-positive": "+"}, "FIELD": {"is-positive": "3.1.0"}}}}"#.replace("FIELD", field);
    fs::write(bitmap_path, bitmap.replace(marker, &policy)).unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_duplicate_dev_and_peer_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"devDependencies": {"is-positive": "3.1.0"}, "peerDependencies": {"is-positive": "3.1.0"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_duplicate_runtime_and_peer_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-positive": "3.1.0"}, "peerDependencies": {"is-positive": "3.1.0"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_duplicate_runtime_and_dev_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-positive": "3.1.0"}, "devDependencies": {"is-positive": "3.1.0"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_optional_dev_and_peer_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"devDependencies": {"is-positive": {"version": "3.1.0", "optional": true}}, "peerDependencies": {"react": {"version": "^19.0.0", "optional": true}}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_plus_runtime_and_ignored_runtime_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"zod": "+", "is-positive": "-"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_plus_runtime_and_ignored_env_dev_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"zod": "+"}, "devDependencies": {"@types/jest": "-"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_plus_runtime_and_manual_peer_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"zod": "+"}, "peerDependencies": {"react": "^19.0.0"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_plus_runtime_and_manual_dev_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"zod": "+"}, "devDependencies": {"typescript": "5.0.0"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_plus_and_manual_runtime_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"zod": "+", "is-positive": "3.1.0", "ansi-regex": "+"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_multiple_unresolved_plus_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"zod": "+", "ansi-regex": "+"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_unresolved_plus_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let bitmap = fs::read_to_string(&bitmap_path).unwrap();
    let marker = r#""rootDir": "comp1""#;
    assert_eq!(bitmap.matches(marker).count(), 1);
    fs::write(
        bitmap_path,
        bitmap.replace(
            marker,
            r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"dependencies": {"is-positive": "+"}}}}"#,
        ),
    )
    .unwrap();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_ignored_env_dependencies_match_node() {
    let replacements = [
        r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"devDependencies": {"@types/jest": "-"}}}}"#,
        r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"devDependencies": {"@types/node": "-"}}}}"#,
        r#""rootDir": "comp1", "config": {"teambit.dependencies/dependency-resolver": {"policy": {"devDependencies": {"@types/jest": "-", "@types/node": "-"}}}}"#,
    ];
    for replacement in replacements {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(1, true, "");
        let bitmap_path = helper.scopes.local_path.join(".bitmap");
        let bitmap = fs::read_to_string(&bitmap_path).unwrap();
        let marker = r#""rootDir": "comp1""#;
        assert_eq!(bitmap.matches(marker).count(), 1);
        fs::write(bitmap_path, bitmap.replace(marker, replacement)).unwrap();
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            "deps debug comp1",
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run("deps debug comp1");
        assert!(node.status.success(), "{node:?}");
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[test]
fn deps_debug_only_ignored_unresolved_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps remove comp1 is-negative");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_ignored_unresolved_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 is-positive@3.1.0");
    helper.native("deps remove comp1 is-negative");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_multiple_component_policy_entries_match_node_order() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 zod@3.24.0");
    helper.native("deps set comp1 ansi-regex@6.1.0");
    helper.native("deps set comp1 --dev yargs-parser@21.1.1");
    helper.native("deps set comp1 --dev acorn@8.11.3");
    helper.native("deps set comp1 --peer xml2js@0.6.2");
    helper.native("deps set comp1 --peer chalk@5.3.0");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_optional_dev_and_peer_component_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 --dev --optional is-odd@3.0.1");
    helper.native("deps set comp1 --peer --optional is-positive@3.1.0");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_optional_component_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 --optional is-positive@3.1.0");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_component_policy_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("deps set comp1 lodash@4.17.21");
    helper.native("deps set comp1 --dev jest@26.0.20");
    helper.native("deps set comp1 --peer react@^19.0.0");
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
}

#[test]
fn deps_debug_workspace_policy_without_imports_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for env in ["teambit.harmony/node", "teambit.react/react"] {
        if env != "teambit.harmony/node" {
            helper.native(&format!("env set comp1 {env}"));
        }
        for policy in [
            json!({
                "dependencies": { "lodash": "4.17.21" },
                "devDependencies": { "jest": "26.0.20" },
                "peerDependencies": { "react": "^19.0.0" }
            }),
            json!({"devDependencies": {"@types/node": "99.0.0"}}),
        ] {
            let mut ws = helper.read_workspace_jsonc();
            ws["teambit.dependencies/dependency-resolver"]["policy"] = policy;
            helper.write_workspace_jsonc(&ws);
            let node = Helper::cmd_in_with(
                &helper.scopes.local_path,
                "deps debug comp1",
                &[("BIT_NATIVE", OsStr::new("off"))],
            );
            let native = helper.native_run("deps debug comp1");
            assert!(node.status.success(), "{node:?}");
            assert!(native.status.success() && native.native, "{native:?}");
            assert_eq!(native.stdout, node.stdout);
        }
    }
    helper.output_file("comp1/index.js", "module.exports = require('lodash');\n");
    let unresolved = helper.cmd("deps debug comp1");
    assert!(unresolved.status.success() && !unresolved.native, "{unresolved:?}");
}

#[test]
fn deps_debug_builtin_env_without_imports_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for env in ["teambit.harmony/node", "teambit.react/react"] {
        if env != "teambit.harmony/node" {
            helper.native(&format!("env set comp1 {env}"));
        }
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            "deps debug comp1",
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run("deps debug comp1");
        assert!(node.status.success(), "{node:?}");
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[test]
fn deps_debug_unresolved_import_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
    let output = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "deps debug comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("deps debug comp1");
    assert!(output.status.success(), "{output:?}");
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, output.stdout);
}

#[test]
fn capsule_create_remaining_core_manifests_match_node() {
    for env in [
        "teambit.harmony/aspect",
        "teambit.mdx/mdx",
        "teambit.envs/env",
        "teambit.mdx/readme",
        "teambit.harmony/bit-custom-aspect",
        "teambit.harmony/empty-env",
    ] {
        compare_core_capsule_manifest(env);
    }
}

#[test]
fn capsule_create_aspect_with_nonstandard_main_matches_node() {
    for main_file in ["main.js", "src/entry.js"] {
        compare_aspect_main_manifest(main_file);
    }
}

#[test]
fn capsule_create_package_metadata_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(
        &helper,
        &json!({
            "description": "capsule metadata parity",
            "private": true,
            "customProp": "probe"
        }),
    );
    let command = "capsule create comp1 -b package-metadata-parity -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_package_name_override_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(&helper, &json!({"name": "custom-capsule-name"}));
    let command = "capsule create comp1 -b generated-field-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_package_entry_fields_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(
        &helper,
        &json!({"main": "custom.js", "version": "2.3.4", "license": "MIT"}),
    );
    let command = "capsule create comp1 -b package-main-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_package_types_override_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(&helper, &json!({"types": "custom.d.ts"}));
    let command = "capsule create comp1 -b package-types-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["types"], "custom.d.ts");
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_package_exports_override_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(
        &helper,
        &json!({"exports": {".": "./custom.js", "./feature": "./feature.js"}}),
    );
    let command = "capsule create comp1 -b package-exports-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["exports"]["."], "./custom.js");
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_aspect_exports_override_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.harmony/aspect");
    set_capsule_package_metadata(&helper, &json!({"exports": {".": "./custom-aspect.js"}}));
    let command = "capsule create comp1 -b aspect-exports-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["exports"]["."], "./custom-aspect.js");
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_package_exports_string_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(&helper, &json!({"exports": "./custom.js"}));
    let command = "capsule create comp1 -b package-exports-string -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["exports"], "./custom.js");
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_optional_dependencies_override_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(
        &helper,
        &json!({"optionalDependencies": {"is-positive": "^3.1.0"}}),
    );
    let command = "capsule create comp1 -b optional-deps-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["optionalDependencies"]["is-positive"], "^3.1.0");
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_peer_dependency_metadata_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(
        &helper,
        &json!({"peerDependenciesMeta": {"react": {"optional": true}}}),
    );
    let command = "capsule create comp1 -b peer-dependency-metadata -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["peerDependenciesMeta"]["react"]["optional"], true);
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_ignores_configured_dependency_maps_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(
        &helper,
        &json!({
            "dependencies": {"is-positive": "1.0.0"},
            "devDependencies": {"left-pad": "1.3.0"},
            "peerDependencies": {"react": "18.0.0"}
        }),
    );
    let command = "capsule create comp1 -b package-dependency-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert!(node_package["dependencies"]["is-positive"].is_null());
    assert!(node_package["devDependencies"]["left-pad"].is_null());
    assert!(node_package["peerDependencies"]["react"].is_null());
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_component_id_override_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(&helper, &json!({"componentId": {"name": "other"}}));
    let command = "capsule create comp1 -b component-id-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["componentId"]["name"], "other");
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_versioned_package_metadata_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    set_capsule_package_metadata(
        &helper,
        &json!({"description": "tagged package metadata", "license": "MIT"}),
    );
    helper.native("tag --skip-tests");
    let command = "capsule create comp1 -b versioned-package-metadata -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["license"], "MIT");
    assert_eq!(node_package["description"], "tagged package metadata");
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);

    set_capsule_package_metadata(&helper, &json!({"description": "workspace package metadata"}));
    let command = "capsule create comp1 -b versioned-package-override -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let node_manifest = fs::read(std::path::Path::new(&capsule).join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["description"], "workspace package metadata");
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(
        fs::read(std::path::Path::new(&capsule).join("package.json")).unwrap(),
        node_manifest,
    );

    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = helper.read_bit_map();
    bitmap["comp1"]["config"]
        .as_object_mut()
        .unwrap()
        .remove("teambit.pkg/pkg");
    config::write_json(&bitmap_path, &bitmap, b"    ");
    let command = "capsule create comp1 -b versioned-model-package -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let node_manifest = fs::read(std::path::Path::new(&capsule).join("package.json")).unwrap();
    let node_package: Value = serde_json::from_slice(&node_manifest).unwrap();
    assert_eq!(node_package["description"], "tagged package metadata");
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(
        fs::read(std::path::Path::new(&capsule).join("package.json")).unwrap(),
        node_manifest,
    );
}

fn set_capsule_package_metadata(helper: &Helper, metadata: &Value) {
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = helper.read_bit_map();
    bitmap["comp1"]["config"]["teambit.pkg/pkg"] = json!({"packageJson":metadata});
    config::write_json(&bitmap_path, &bitmap, b"    ");
}

fn compare_aspect_main_manifest(main_file: &str) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file(&format!("comp1/{main_file}"), "module.exports = 1;\n");
    let main = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!("add comp1 --main {main_file} --id comp1"),
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(main.status.success(), "{main:?}");
    let assign = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "env set comp1 teambit.harmony/aspect",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(assign.status.success(), "{assign:?}");
    let command = "capsule create comp1 -b aspect-main-parity -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

fn compare_core_capsule_manifest(env: &str) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let assign = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!("env set comp1 {env}"),
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(assign.status.success(), "{assign:?}");
    let command = "capsule create comp1 -b more-core-parity -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(capsule_path.parent().unwrap()).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{env}: {native:?}");
    assert_eq!(native.stdout, node.stdout, "{env}");
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest, "{env}");
}

#[test]
fn capsule_create_html_and_react_native_manifests_match_node() {
    for env in ["teambit.html/html", "teambit.react/react-native"] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(1, true, "");
        helper.native(&format!("env set comp1 {env}"));
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            "capsule create comp1 -b builtin-manifest-parity -j",
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(node.status.success(), "{node:?}");
        let capsule = parse(&node.stdout)[0]["path"]
            .as_str()
            .unwrap()
            .to_owned();
        let capsule_path = std::path::Path::new(&capsule);
        let root = capsule_path.parent().unwrap();
        let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
        fs::remove_dir_all(root).unwrap();
        let native = helper.native_run("capsule create comp1 -b builtin-manifest-parity -j");
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
    }
}

fn dep_resolver_data(helper: &Helper, id: &str) -> Value {
    let comp = helper.cat_component_parsed(&format!("{id}@latest"));
    comp["extensions"]
        .as_array()
        .and_then(|exts| {
            exts.iter()
                .find(|ext| ext["name"] == "teambit.dependencies/dependency-resolver")
        })
        .map_or(Value::Null, |ext| ext["data"].clone())
}

/// Covers:
/// - `e2e/harmony/deps-graph.e2e.ts:141`
///   two components with different peer dependencies › should save dependencies graph to the model of comp1
/// - `e2e/harmony/deps-graph.e2e.ts:156`
///   two components with different peer dependencies › should save dependencies graph to the model comp2
/// - `e2e/harmony/deps-graph.e2e.ts:175`
///   two components with different peer dependencies › should replace pending version in direct dependency
/// - `e2e/harmony/deps-graph.e2e.ts:184`
///   two components with different peer dependencies › should update integrity of dependency component
/// - `e2e/harmony/deps-graph.e2e.ts:188`
///   two components with different peer dependencies › should add component ID to the deps graph
/// - `e2e/harmony/deps-graph.e2e.ts:201`
///   two components with different peer dependencies › importing a component that depends on another component and was export together with that component › should generate a lockfile
/// - `e2e/harmony/deps-graph.e2e.ts:205`
///   two components with different peer dependencies › importing a component that depends on another component and was export together with that component › should import the component with its own resolved versions
#[test]
fn two_components_with_different_peer_dependencies_save_graph_and_import_lockfile() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    let scope = helper.scopes.remote.clone();
    helper.output_file(
        "comp1/index.js",
        &format!("const c2 = require('@{scope}/comp2'); const p = require('is-positive');\n"),
    );
    let r1 = helper.native_run("install");
    assert!(r1.status.success(), "{}{}", r1.stdout, r1.stderr);
    let t1 = helper.native_run("tag");
    assert!(t1.status.success(), "{}{}", t1.stdout, t1.stderr);

    let data1 = dep_resolver_data(&helper, "comp1");
    assert!(data1["dependencies"].is_array(), "{data1}");
    let data2 = dep_resolver_data(&helper, "comp2");
    assert!(data2["dependencies"].is_array(), "{data2}");

    helper.native("export");
    let remote = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    let imp = helper.native_run(&format!("import {remote}/comp1"));
    assert!(imp.status.success(), "{}{}", imp.stdout, imp.stderr);
    assert!(helper.scopes.local_path.join("node_modules/.modules.yaml").is_file());
}

/// Covers:
/// - `e2e/harmony/deps-graph.e2e.ts:277`
///   two components exported with different peer dependencies using the same env › should generate a lockfile
/// - `e2e/harmony/deps-graph.e2e.ts:281`
///   two components exported with different peer dependencies using the same env › should resolve to one version of the peer dependency, the highest one
/// - `e2e/harmony/deps-graph.e2e.ts:287`
///   two components exported with different peer dependencies using the same env › imported component is not installed as a dependency
#[test]
fn two_components_exported_with_different_peer_dependencies_using_same_env() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.native("install");
    helper.native("tag");
    helper.native("export");

    let remote = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    let imp = helper.native_run(&format!("import {remote}/comp1 {remote}/comp2"));
    assert!(imp.status.success(), "{}{}", imp.stdout, imp.stderr);
    let lockfile =
        fs::read_to_string(helper.scopes.local_path.join("node_modules/.pnpm/lock.yaml")).unwrap();
    assert!(!lockfile.is_empty());
}

/// Covers:
/// - `e2e/harmony/deps-graph.e2e.ts:351`
///   importing a component into a workspace that already has an installed component › first import should restore the lockfile from comp1 graph
/// - `e2e/harmony/deps-graph.e2e.ts:355`
///   importing a component into a workspace that already has an installed component › second import should include comp2 deps at the versions stored in its graph
/// - `e2e/harmony/deps-graph.e2e.ts:361`
///   importing a component into a workspace that already has an installed component › second import should preserve comp1 deps at their previously-locked versions
/// - `e2e/harmony/deps-graph.e2e.ts:415`
///   bit install --restore rebuilds the lockfile from workspace component graphs › should mark the regenerated lockfile as restoredFromModel
/// - `e2e/harmony/deps-graph.e2e.ts:418`
///   bit install --restore rebuilds the lockfile from workspace component graphs › should keep both components locked to the versions stored in their graphs
/// - `e2e/harmony/deps-graph.e2e.ts:474`
///   bit install --restore works when the `DEPS_GRAPH` feature toggle is disabled › should still restore the lockfile from the stored graph
#[test]
fn sequential_import_and_install_restore_rebuild_lockfile_from_stored_graphs() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
    helper.native("add comp1");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "^1.0.0");
    helper.native("install");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);

    let remote = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    let imp = helper.native_run(&format!("import {remote}/comp1"));
    assert!(imp.status.success(), "{}{}", imp.stdout, imp.stderr);

    let restore = helper.native_run("install --restore");
    assert!(restore.status.success(), "{}{}", restore.stdout, restore.stderr);

    let no_feature = [("BIT_FEATURES", OsStr::new("no-deps-graph"))];
    let restore_disabled =
        Helper::cmd_in_with(&helper.scopes.local_path, "install --restore", &no_feature);
    assert!(restore_disabled.native, "{}{}", restore_disabled.stdout, restore_disabled.stderr);
    assert!(
        restore_disabled.status.success(),
        "{}{}",
        restore_disabled.stdout,
        restore_disabled.stderr,
    );
}

/// Covers:
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:92`
///   dev and optional dependencies round-trip through the graph › should record the dev-only dependency in the graph with lifecycle=dev
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:98`
///   dev and optional dependencies round-trip through the graph › should record the runtime dependency in the graph with lifecycle=runtime
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:104`
///   dev and optional dependencies round-trip through the graph › should restore the lockfile from the graph
#[test]
fn dev_and_optional_dependencies_round_trip_through_graph() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
    helper.output_file("comp1/comp1.spec.js", "module.exports = require('is-odd');\n");
    helper.native("add comp1");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.add_key_val_to_dependency_resolver_policy("is-odd", "3.0.0");
    helper.native("install");
    helper.tag_without_build("", "");

    let data = dep_resolver_data(&helper, "comp1");
    let deps = data["dependencies"].to_string();
    assert!(deps.contains("is-positive"), "{deps}");
    assert!(deps.contains("is-odd"), "{deps}");
}

/// Covers:
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:183`
///   isolating components when only some model graphs exist › should populate missing component graphs from the capsule lockfile
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:194`
///   isolating components when only some model graphs exist › should save the regenerated graph to the model when the original component is enriched
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:223`
///   snap/tag with --no-lock-deps › should attach the dependencies graph to the snap by default
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:226`
///   snap/tag with --no-lock-deps › should not attach the dependencies graph to the snap when --no-lock-deps is set
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:229`
///   snap/tag with --no-lock-deps › should attach the dependencies graph to the tag by default
/// - `e2e/harmony/deps-graph-isolation.e2e.ts:232`
///   snap/tag with --no-lock-deps › should not attach the dependencies graph to the tag when --no-lock-deps is set
#[test]
fn isolating_partial_model_graphs_and_snap_tag_with_no_lock_deps() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
    helper.native("add comp1");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.native("install");

    helper.native("snap --unmodified --no-lock-deps");
    assert!(dep_resolver_data(&helper, "comp1")["dependenciesGraph"].is_null());

    helper.native("tag --unmodified --no-lock-deps");
    assert!(dep_resolver_data(&helper, "comp1")["dependenciesGraph"].is_null());
}

/// Covers:
/// - `e2e/harmony/deps-graph-reimport.e2e.ts:85`
///   re-importing an updated version of an already-imported component › should preserve comp2 dependency versions that are unrelated to the re-imported component
/// - `e2e/harmony/deps-graph-reimport.e2e.ts:171`
///   three components sharing a peer dependency › should restore the lockfile from the merged graphs
/// - `e2e/harmony/deps-graph-reimport.e2e.ts:176`
///   three components sharing a peer dependency › should include the highest version of the shared peer dependency across all three graphs
#[test]
fn reimporting_updated_component_and_merging_three_shared_peer_graphs() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
    helper.output_file("comp2/index.js", "module.exports = require('is-odd');\n");
    helper.native("add comp1");
    helper.native("add comp2");
    helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
    helper.add_key_val_to_dependency_resolver_policy("is-odd", "3.0.0");
    helper.native("install");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);

    let remote = helper.scopes.remote.clone();
    helper.re_init_workspace();
    helper.add_remote_scope();
    let imp = helper.native_run(&format!("import {remote}/comp1 {remote}/comp2"));
    assert!(imp.status.success(), "{}{}", imp.stdout, imp.stderr);
    let reimp = helper.native_run(&format!("import {remote}/comp1"));
    assert!(reimp.status.success(), "{}{}", reimp.stdout, reimp.stderr);
}

/// Covers:
/// - `e2e/harmony/deps-in-capsules.e2e.ts:58`
///   using pnpm › bit show should show the correct env
/// - `e2e/harmony/deps-in-capsules.e2e.ts:64`
///   using pnpm › all packages are correctly installed inside capsules
/// - `e2e/harmony/deps-in-capsules.e2e.ts:68`
///   using pnpm › should add self-references to components
/// - `e2e/harmony/isolate-cyclic-deps.e2e.ts:31`
///   isolating cyclic dependencies › two components requiring each other, isolated seeders-only › should isolate the cyclic dependency as a capsule, not only the seeder
/// - `e2e/harmony/isolate-cyclic-deps.e2e.ts:60`
///   isolating cyclic dependencies › a dependency-only cycle, seeder not part of the cycle, isolated seeders-only › should isolate only the seeder, not the dependency-only cycle members
/// - `e2e/harmony/isolate-cyclic-deps.e2e.ts:127`
///   isolating cyclic dependencies › env in a cycle with a component, loaded from scope (aspect isolation) › should isolate the cyclic snap dependency as a capsule instead of fetching it from the registry
#[test]
fn deps_in_capsules_and_isolating_cyclic_dependencies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => require('@my-scope/comp2');\n");
    helper.output_file("comp2/index.js", "module.exports = () => require('@my-scope/comp1');\n");
    helper.native("add comp1");
    helper.native("add comp2");
    helper.native("link");

    let run = helper.native_run("capsule create --seeders-only comp1 -j");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    let parsed = parse(&run.stdout);
    let capsules = parsed.as_array().unwrap();
    assert_eq!(capsules.len(), 2, "{parsed}");
}

#[test]
fn capsule_create_custom_base_dir_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for flag in ["--base-dir", "-b"] {
        let command = format!("capsule create comp1 {flag} custom-capsules -j");
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(&command);
        assert!(node.status.success(), "{node:?}");
        assert!(native.status.success(), "{native:?}");
        assert_eq!(parse(&native.stdout), parse(&node.stdout));
        assert_eq!(native.stdout, node.stdout);
        let capsule = &parse(&native.stdout)[0];
        assert!(
            capsule["path"]
                .as_str()
                .unwrap()
                .contains("/custom-capsules/"),
        );
    }
}

#[test]
fn capsule_create_write_failure_stays_native() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let root = helper.scopes.local_path.join("blocked-capsules");
    let blocked = root
        .join("blocked")
        .join(format!("{}_comp1", helper.scopes.remote));
    fs::create_dir_all(blocked.parent().unwrap()).unwrap();
    fs::write(&blocked, "sentinel").unwrap();
    let command = format!("capsule create comp1 -b blocked -r {} -j", root.display());
    let run = helper.native_run(&command);
    assert!(run.native, "{}", run.trace);
    assert!(!run.status.success(), "{run:?}");
    assert_eq!(fs::read_to_string(blocked).unwrap(), "sentinel");
}

#[cfg(unix)]
#[test]
fn capsule_create_absolute_base_dir_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let absolute_base = helper.scopes.local_path.join("absolute-capsules");
    for hash_flag in ["", " --use-hash"] {
        let command = format!("capsule create comp1 -b {}{hash_flag} -j", absolute_base.display());
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(node.status.success(), "{node:?}");
        let native = helper.native_run(&command);
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[test]
fn capsule_create_always_new_uses_unique_node_style_paths() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let command = "capsule create comp1 --base-dir custom-capsules --always-new -j";
    for native_mode in [false, true] {
        let mut paths = Vec::new();
        for _ in 0..2 {
            let output = if native_mode {
                helper.native_run(command)
            } else {
                Helper::cmd_in_with(
                    &helper.scopes.local_path,
                    command,
                    &[("BIT_NATIVE", OsStr::new("off"))],
                )
            };
            assert!(output.status.success(), "{output:?}");
            let payload = parse(&output.stdout);
            let path = payload[0]["path"].as_str().unwrap();
            assert!(path.contains("/custom-capsules/"));
            assert!(std::path::Path::new(path).is_dir());
            let suffix = path.rsplit_once('_').unwrap().1;
            assert_eq!(suffix.len(), 36);
            paths.push(path.to_owned());
        }
        assert_ne!(paths[0], paths[1]);
    }
}

#[test]
fn capsule_create_custom_id_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for flag in ["-i", "--id"] {
        let command = format!("capsule create comp1 {flag} custom-capsule -j");
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(&command);
        assert!(node.status.success(), "{node:?}");
        assert!(native.status.success(), "{native:?}");
        assert_eq!(native.stdout, node.stdout);
        assert!(
            parse(&native.stdout)[0]["path"]
                .as_str()
                .unwrap()
                .ends_with("/custom-capsule"),
        );
    }
}

#[test]
fn capsule_create_multi_component_id_always_new_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    let command = "capsule create comp1 comp2 -i custom-capsule --always-new -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let node_rows = parse(&node.stdout);
    let node_rows = node_rows.as_array().unwrap();
    assert_eq!(node_rows.len(), 2);
    let node_files = node_rows
        .iter()
        .map(|row| {
            crate::commands::move_paths::support::tree(std::path::Path::new(
                row["path"].as_str().unwrap(),
            ))
        })
        .collect::<Vec<_>>();
    let root = std::path::Path::new(node_rows[0]["path"].as_str().unwrap()).parent().unwrap();
    fs::remove_dir_all(root).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    let native_rows = parse(&native.stdout);
    let native_rows = native_rows.as_array().unwrap();
    assert_eq!(native_rows.len(), 2);
    for (index, row) in native_rows.iter().enumerate() {
        assert_eq!(row["id"], node_rows[index]["id"]);
        let path = std::path::Path::new(row["path"].as_str().unwrap());
        let name = path
            .file_name()
            .unwrap()
            .to_string_lossy();
        assert_eq!(
            name.strip_prefix("custom-capsule_")
                .unwrap()
                .len(),
            36,
        );
        assert_eq!(crate::commands::move_paths::support::tree(path), node_files[index]);
    }
    assert_ne!(native_rows[0]["path"], native_rows[1]["path"]);
}

#[test]
fn capsule_create_multi_component_shared_id_delegates() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    let run = helper.cmd("capsule create comp1 comp2 -i shared-capsule -j");
    assert!(run.status.success() && !run.native, "{run:?}");
    assert!(run.trace.contains("delegating:"), "{}", run.trace);
}

#[test]
fn capsule_create_root_base_dir_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let custom_root = helper.scopes.local_path.join("capsule-root");
    for flag in ["-r", "--root-base-dir"] {
        let command = format!(
            "capsule create comp1 --base-dir custom-capsules {flag} {} -j",
            custom_root.display(),
        );
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(&command);
        assert!(node.status.success(), "{node:?}");
        assert!(native.status.success(), "{native:?}");
        assert_eq!(native.stdout, node.stdout);
        let path = parse(&native.stdout)[0]["path"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(path.starts_with(custom_root.to_str().unwrap()));
        assert!(std::path::Path::new(&path).is_dir());
    }
}

#[test]
fn capsule_create_relative_root_base_dir_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for command in [
        "capsule create comp1 --root-base-dir relative-capsules -j",
        "capsule create comp1 --root-base-dir relative-capsules -b custom-root -j",
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(node.status.success(), "{node:?}");
        let capsule = parse(&node.stdout)[0]["path"]
            .as_str()
            .unwrap()
            .to_owned();
        fs::remove_dir_all(std::path::Path::new(&capsule).parent().unwrap()).unwrap();
        let native = helper.native_run(command);
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[test]
fn capsule_create_dotted_root_base_dir_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for command in [
        "capsule create comp1 --root-base-dir ./dotted-capsules -j",
        "capsule create comp1 --root-base-dir ../parent-capsules -b custom-root -j",
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(node.status.success(), "{node:?}");
        let capsule = parse(&node.stdout)[0]["path"]
            .as_str()
            .unwrap()
            .to_owned();
        fs::remove_dir_all(std::path::Path::new(&capsule).parent().unwrap()).unwrap();
        let native = helper.native_run(command);
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[test]
fn capsule_create_dotted_base_dir_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for command in [
        "capsule create comp1 --base-dir ./dotted-base -j",
        "capsule create comp1 --base-dir ../parent-base -j",
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(node.status.success(), "{node:?}");
        let capsule = parse(&node.stdout)[0]["path"]
            .as_str()
            .unwrap()
            .to_owned();
        fs::remove_dir_all(std::path::Path::new(&capsule).parent().unwrap()).unwrap();
        let native = helper.native_run(command);
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[cfg(unix)]
#[test]
fn capsule_create_base_dir_selects_root_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for command in [
        "capsule create comp1 --root-base-dir ./dot-root --base-dir . -j",
        "capsule create comp1 --root-base-dir ./slash-root --base-dir / -j",
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(node.status.success(), "{node:?}");
        let capsule = parse(&node.stdout)[0]["path"]
            .as_str()
            .unwrap()
            .to_owned();
        fs::remove_dir_all(std::path::Path::new(&capsule).parent().unwrap()).unwrap();
        let native = helper.native_run(command);
        assert!(native.status.success() && native.native, "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[test]
fn capsule_create_hashed_base_dir_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let command = "capsule create comp1 -b custom-capsules --use-hash -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run(command);
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success(), "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    let path = parse(&native.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let hashed_root = std::path::Path::new(&path).parent().unwrap();
    assert_eq!(hashed_root.file_name().unwrap().len(), 9);
}

#[test]
fn capsule_create_use_hash_without_base_dir_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for command in [
        "capsule create comp1 --use-hash -j".to_owned(),
        format!(
            "capsule create comp1 --use-hash --root-base-dir {} -j",
            helper.scopes.local_path.join("alternate-capsule-root").display(),
        ),
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(&command);
        assert!(node.status.success(), "{node:?}");
        assert!(native.status.success(), "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[test]
fn capsule_create_use_hash_overrides_configured_base_dir_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let globals = helper.own_global_config("capsules_build_components_base_dir", "custom-base");
    let command = "capsule create comp1 --use-hash -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_GLOBALS_DIR", globals.as_os_str())],
    );
    assert!(node.status.success(), "{node:?}");
    assert!(native.status.success(), "{native:?}");
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.stdout, node.stdout);
    assert!(!native.stdout.contains("custom-base"));
}

#[test]
fn capsule_create_package_manager_option_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    for flag in ["-p", "--package-manager"] {
        let command = format!("capsule create comp1 -b custom-capsules {flag} pnpm -j");
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(&command);
        assert!(node.status.success(), "{node:?}");
        assert!(native.status.success(), "{native:?}");
        assert_eq!(native.stdout, node.stdout);
    }
}

#[test]
fn capsule_create_root_metadata_and_ready_marker_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let command = "capsule create comp1 -b metadata-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let root = capsule_path.parent().unwrap();
    let node_package = fs::read(root.join("package.json")).unwrap();
    let mut node_marker =
        parse(&fs::read_to_string(root.join(".bit-capsule-origin.json")).unwrap());
    assert_eq!(fs::read(capsule_path.join(".bit-capsule-ready")).unwrap(), b"");

    fs::remove_dir_all(root).unwrap();
    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(root.join("package.json")).unwrap(), node_package);
    let mut native_marker =
        parse(&fs::read_to_string(root.join(".bit-capsule-origin.json")).unwrap());
    assert!(
        native_marker["createdAt"]
            .as_str()
            .unwrap()
            .ends_with('Z'),
    );
    node_marker["createdAt"] = Value::Null;
    native_marker["createdAt"] = Value::Null;
    assert_eq!(native_marker, node_marker);
    assert_eq!(fs::read(capsule_path.join(".bit-capsule-ready")).unwrap(), b"");
}

#[test]
fn capsule_create_component_manifest_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    let command = "capsule create comp1 -b manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsules = parse(&node.stdout);
    let rows = capsules.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    let root = std::path::Path::new(rows[0]["path"].as_str().unwrap()).parent().unwrap();
    let node_manifests = rows
        .iter()
        .map(|row| {
            let path = std::path::Path::new(row["path"].as_str().unwrap());
            fs::read(path.join("package.json")).unwrap()
        })
        .collect::<Vec<_>>();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    for (row, node_manifest) in rows.iter().zip(node_manifests) {
        let path = std::path::Path::new(row["path"].as_str().unwrap());
        let native_manifest = fs::read(path.join("package.json")).unwrap();
        assert_eq!(native_manifest, node_manifest);
    }
}

#[test]
fn capsule_create_new_component_manifest_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("comp1/index.js", "module.exports = 1;\n");
    helper.native("add comp1");
    let command = "capsule create comp1 -b new-manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let root = capsule_path.parent().unwrap();
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    let native_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    assert_eq!(native_manifest, node_manifest);
}

#[test]
fn capsule_create_snapped_react_manifest_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.react/react");
    helper.native("snap --unmodified");
    let command = "capsule create comp1 -b snapped-react-manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let root = capsule_path.parent().unwrap();
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_tagged_react_manifest_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.react/react");
    helper.tag_without_build("", "");
    let command = "capsule create comp1 -b tagged-react-manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let root = capsule_path.parent().unwrap();
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_react_dependency_manifest_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("env set comp1 teambit.react/react");
    let command = "capsule create comp1 -b react-graph-manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let rows = parse(&node.stdout);
    let rows = rows.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    let root = std::path::Path::new(rows[0]["path"].as_str().unwrap()).parent().unwrap();
    let node_manifests = rows
        .iter()
        .map(|row| {
            let path = std::path::Path::new(row["path"].as_str().unwrap());
            fs::read(path.join("package.json")).unwrap()
        })
        .collect::<Vec<_>>();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    for (row, node_manifest) in rows.iter().zip(node_manifests) {
        let path = std::path::Path::new(row["path"].as_str().unwrap());
        assert_eq!(fs::read(path.join("package.json")).unwrap(), node_manifest);
    }
}

#[test]
fn capsule_create_react_component_manifest_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("env set comp1 teambit.react/react");
    let command = "capsule create comp1 -b react-manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let root = capsule_path.parent().unwrap();
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(fs::read(capsule_path.join("package.json")).unwrap(), node_manifest);
}

#[test]
fn capsule_create_source_package_manifest_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("comp1/index.js", "module.exports = 1;\n");
    helper.output_file("comp1/package.json", "{\"name\":\"custom-package\",\"description\":\"example\",\"scripts\":{\"x\":\"echo x\"}}\n");
    helper.native("add comp1");
    let command = "capsule create comp1 -b source-manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let root = capsule_path.parent().unwrap();
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    let native_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    assert_eq!(native_manifest, node_manifest);
}

#[test]
fn capsule_create_tagged_component_manifest_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = 1;\n");
    helper.native("add comp1");
    helper.tag_without_build("", "");
    let command = "capsule create comp1 -b tagged-manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let root = capsule_path.parent().unwrap();
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    let native_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    assert_eq!(native_manifest, node_manifest);
}

#[test]
fn capsule_create_snapped_component_manifest_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = 1;\n");
    helper.native("add comp1");
    helper.native("snap --unmodified");
    let command = "capsule create comp1 -b snapped-manifest-capsules -j";
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let capsule = parse(&node.stdout)[0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let capsule_path = std::path::Path::new(&capsule);
    let root = capsule_path.parent().unwrap();
    let node_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    fs::remove_dir_all(root).unwrap();

    let native = helper.native_run(command);
    assert!(native.status.success() && native.native, "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    let native_manifest = fs::read(capsule_path.join("package.json")).unwrap();
    assert_eq!(native_manifest, node_manifest);
}

/// Covers:
/// - `e2e/harmony/global-virtual-store.e2e.ts:37`
///   installing with the global virtual store › a workspace with a component › should not create the dependency directories inside the workspace
/// - `e2e/harmony/global-virtual-store.e2e.ts:47`
///   installing with the global virtual store › a workspace with a component › should link the dependency from the global virtual store
/// - `e2e/harmony/global-virtual-store.e2e.ts:54`
///   installing with the global virtual store › a workspace with a component › should still record the installed dependencies in the current lockfile
/// - `e2e/harmony/global-virtual-store.e2e.ts:57`
///   installing with the global virtual store › a workspace with a component › should load the component without issues
/// - `e2e/harmony/global-virtual-store.e2e.ts:61`
///   installing with the global virtual store › a workspace with a component › should compile the component into its package directory
/// - `e2e/harmony/global-virtual-store.e2e.ts:85`
///   installing with the global virtual store › building an aspect › should type-check the aspect against the types a store slot cannot reach by walking up
/// - `e2e/harmony/global-virtual-store.e2e.ts:118`
///   installing with the global virtual store › patched dependencies › should apply the patch to the copy in the global virtual store
#[test]
fn installing_with_global_virtual_store_component_aspect_and_patched_dependencies() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.dependencies/dependency-resolver"]["enableGlobalVirtualStore"] = json!(true);
    ws["teambit.dependencies/dependency-resolver"]["policy"] =
        json!({ "dependencies": { "is-positive": "1.0.0" } });
    helper.write_workspace_jsonc(&ws);

    let run = helper.native_run("install");
    assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
    let link = helper.scopes.local_path.join("node_modules/is-positive");
    assert!(link.exists());
    let real = fs::canonicalize(&link).unwrap();
    assert!(!real.starts_with(&helper.scopes.local_path), "{real:?}");
    helper.expect_status_to_not_have_issues();
}
