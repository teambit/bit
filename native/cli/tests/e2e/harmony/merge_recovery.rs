//! Published continuation and abort run configured callbacks around native retained merge state.
mod configuration;
mod interactive;
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs, path::Path};

fn node(helper: &Helper, command: &str) {
    let run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(run.status.success(), "{command}: {} {}", run.stdout, run.stderr);
}

pub(super) fn pending() -> Helper {
    pending_with(false)
}

fn pending_with(fail: bool) -> Helper {
    let helper = super::snapshot_environments::callback_workspace(fail);
    let id = format!("{}/callbacks/hook", helper.scopes.remote);
    let configuration =
        fs::read_to_string(helper.scopes.local_path.join("bar/component.json")).unwrap();
    helper.delete_path("bar/component.json");
    let workspace_path = helper.scopes.local_path.join("workspace.jsonc");
    let mut workspace = config::read_jsonc(&workspace_path);
    workspace
        .as_object_mut()
        .unwrap()
        .remove(&id);
    fs::write(&workspace_path, serde_json::to_string_pretty(&workspace).unwrap()).unwrap();
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    node(&helper, "tag bar/foo -m base");
    crate::helper::remote::publish(&helper);
    node(&helper, "lane create dev");
    helper.output_file("bar/foo.js", "module.exports = 'lane';");
    node(&helper, "snap bar/foo -m lane");
    crate::helper::remote::publish(&helper);
    node(&helper, "switch main --force-theirs -x");
    helper.output_file("bar/foo.js", "module.exports = 'main';");
    node(&helper, "tag bar/foo -m main");
    crate::helper::remote::publish(&helper);
    node(&helper, "lane merge dev --manual --no-snap -x");
    config::set_workspace_key(&helper.scopes.local_path, &id, serde_json::json!({}));
    helper.output_file("bar/component.json", &configuration);
    helper
}

#[test]
fn configured_merge_resolution_runs_published_presnap_and_load_callbacks() {
    let helper = pending();
    helper.output_file("bar/foo.js", "module.exports = 'resolved';");
    helper.output_file(".bitTmp/stale", "temporary prefix");
    let oracle = helper.clone_workspace();
    let home = tempfile::tempdir().unwrap();
    fs::write(home.path().join(".bitrc.jsonc"), r#"{"teambit.preview/preview":{"disabled":true}}"#)
        .unwrap();
    compare_with(
        &helper,
        &oracle,
        "merge bar/foo --resolve -m resolved -x",
        &[("HOME", home.path().as_os_str()), ("USERPROFILE", home.path().as_os_str())],
    );
    let mut actual = super::snapshot_environments::version(&helper.scopes.local_path);
    let mut expected = super::snapshot_environments::version(&oracle);
    for value in [&mut actual, &mut expected] {
        for entry in value["modified"].as_array_mut().unwrap() {
            entry
                .as_object_mut()
                .unwrap()
                .remove("date");
        }
    }
    assert_eq!(actual, expected);
    assert!(!helper.scopes.local_path.join(".bitTmp").exists());
}

#[test]
fn configured_lane_abort_restores_config_sources_and_temporary_prefix() {
    let helper = pending();
    helper.output_file(".bitTmp/stale", "temporary prefix");
    let oracle = helper.clone_workspace();
    compare(&helper, &oracle, "lane merge-abort --silent -x");
    for path in ["workspace.jsonc", ".bitmap", ".bit/unmerged.json"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(path)).unwrap(),
            fs::read(oracle.join(path)).unwrap(),
            "{path}",
        );
    }
    assert!(!helper.scopes.local_path.join(".bitTmp").exists());
}

#[test]
fn failed_resolution_presnap_is_not_replayed_after_source_side_effects() {
    let helper = pending_with(true);
    helper.output_file("bar/foo.js", "module.exports = 'resolved';");
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let oracle = helper.clone_workspace();
    let command = "merge bar/foo --resolve -m rejected -x";
    let native = helper.native_run(command);
    let released = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), released.status.code());
    assert!(!native.status.success());
    assert_eq!(
        super::checkout_callbacks::stable_output(&native.stdout),
        super::checkout_callbacks::stable_output(&released.stdout),
    );
    assert_eq!(native.stderr, released.stderr);
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), bitmap);
    for path in ["bar/foo.js", ".bit/unmerged.json"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(path)).unwrap(),
            fs::read(oracle.join(path)).unwrap(),
            "{path}",
        );
    }
    assert_eq!(
        super::snapshot_environments::version(&helper.scopes.local_path),
        super::snapshot_environments::version(&oracle),
    );
}

#[test]
fn failed_lane_abort_callback_keeps_canonical_restored_control_prefix() {
    let helper = pending();
    helper.output_file("checkout-load-fails", "reject");
    let oracle = helper.clone_workspace();
    let command = "lane merge-abort --silent -x";
    let native = helper.native_run(command);
    let released = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(
        native.status.code(),
        released.status.code(),
        "native {} {}\nNode {} {}",
        native.stdout,
        native.stderr,
        released.stdout,
        released.stderr,
    );
    assert_eq!(
        super::checkout_callbacks::stable_output(&native.stdout),
        super::checkout_callbacks::stable_output(&released.stdout),
    );
    assert_eq!(native.stderr, released.stderr);
    for path in
        ["workspace.jsonc", ".bitmap", ".bit/unmerged.json", "bar/foo.js", "checkout-load-count"]
    {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(path)).unwrap(),
            fs::read(oracle.join(path)).unwrap(),
            "{path}",
        );
    }
}

#[test]
fn component_abort_callback_failure_does_not_clear_pending_state_or_replay() {
    let helper = pending();
    helper.output_file("checkout-load-fails", "reject");
    let oracle = helper.clone_workspace();
    let command = "merge bar/foo --abort -x";
    let native = helper.native_run(command);
    let released = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(
        native.status.code(),
        released.status.code(),
        "native {} {}\nNode {} {}",
        native.stdout,
        native.stderr,
        released.stdout,
        released.stderr,
    );
    assert!(!native.status.success());
    assert_eq!(
        super::checkout_callbacks::stable_output(&native.stdout),
        super::checkout_callbacks::stable_output(&released.stdout),
    );
    assert_eq!(native.stderr, released.stderr);
    for path in [".bitmap", ".bit/unmerged.json", "bar/foo.js", "checkout-load-count"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(path)).unwrap(),
            fs::read(oracle.join(path)).unwrap(),
            "{path}",
        );
    }
}

#[test]
fn configured_abort_uses_the_embedded_git_scope_for_backup_and_pending_state() {
    let helper = pending();
    fs::create_dir(helper.scopes.local_path.join(".git")).unwrap();
    fs::rename(helper.scopes.local_path.join(".bit"), helper.scopes.local_path.join(".git/bit"))
        .unwrap();
    let oracle = helper.clone_workspace();
    compare(&helper, &oracle, "lane merge-abort --silent -x");
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".git/bit/unmerged.json")).unwrap(),
        fs::read(oracle.join(".git/bit/unmerged.json")).unwrap(),
    );
}

fn compare(helper: &Helper, oracle: &Path, command: &str) {
    compare_with(helper, oracle, command, &[]);
}
fn compare_with(helper: &Helper, oracle: &Path, command: &str, environment: &[(&str, &OsStr)]) {
    let native = Helper::cmd_in_with(&helper.scopes.local_path, command, environment);
    assert!(native.native, "{}", native.trace);
    let mut environment = environment.to_vec();
    environment.push(("BIT_NATIVE", OsStr::new("off")));
    let released = Helper::cmd_in_with(oracle, command, &environment);
    assert_eq!(
        native.status.code(),
        released.status.code(),
        "{command}: native {} {}\nNode {} {}",
        native.stdout,
        native.stderr,
        released.stdout,
        released.stderr,
    );
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    assert_eq!(
        super::checkout_callbacks::stable_output(&native.stdout),
        super::checkout_callbacks::stable_output(&released.stdout),
    );
    assert_eq!(native.stderr, released.stderr);
    for path in ["bar/foo.js", "bar/component.json"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(path)).unwrap(),
            fs::read(oracle.join(path)).unwrap(),
            "{path}",
        );
    }
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let expected = config::read_jsonc(&oracle.join(".bitmap"));
    let version = bitmap["bar/foo"]["version"].as_str().unwrap();
    let expected_version = expected["bar/foo"]["version"].as_str().unwrap();
    assert_eq!(
        bitmap.to_string().replace(version, "ALLOCATED_SNAP"),
        expected.to_string().replace(expected_version, "ALLOCATED_SNAP"),
    );
}
