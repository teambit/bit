//! Export operation grammar and local reconciliation match the pinned published CLI.
mod packages;
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs, path::Path};

fn pending() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'first';\n");
    helper.add_component_bar_foo();
    for message in ["first", "second", "third"] {
        helper.create_component_bar_foo(&format!("module.exports = '{message}';\n"));
        helper.run(&format!("tag bar/foo --message {message}"));
    }
    helper
}

fn parity(helper: &Helper, command: &str) {
    compare(helper, command, true);
}

fn compare(helper: &Helper, command: &str, native: bool) {
    let remote = helper.clone_remote_scope();
    let expected_root = helper.clone_workspace();
    let expected = Helper::cmd_in_with(
        &expected_root,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let expected_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&remote);
    let actual =
        Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
    assert_eq!(actual.native, native, "{command}: {}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code(), "{} {}", actual.stdout, actual.stderr);
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    compare_controls(&helper.scopes.local_path, &expected_root);
    packages::compare(&helper.scopes.local_path, &expected_root);
    super::export_hub::comparison::objects(
        &bit_object_import::scope_path(&helper.scopes.local_path),
        &bit_object_import::scope_path(&expected_root),
    );
    super::export_hub::comparison::remote_objects(&helper.scopes.remote_path, &expected_remote);
}

fn compare_controls(actual: &Path, expected: &Path) {
    assert_eq!(
        config::read_jsonc(&actual.join(".bitmap")),
        config::read_jsonc(&expected.join(".bitmap")),
    );
    for file in ["staged-snaps", "staged-config/main.json", "last-merged", "index.json"] {
        assert_eq!(
            fs::read(bit_object_import::scope_path(actual).join(file)).ok(),
            fs::read(bit_object_import::scope_path(expected).join(file)).ok(),
            "{file}",
        );
    }
}

#[test]
fn multiple_pending_versions_reconcile_once_like_node() {
    parity(&pending(), "export --verbose");
}

#[test]
fn json_ignores_head_only_like_node() {
    parity(&pending(), "export --json --head-only --all-versions");
}

#[test]
fn empty_json_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    parity(&helper, "export --json");
}

#[test]
fn explicit_component_on_lane_preserves_canonical_stack_before_effects() {
    let helper = pending();
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    compare(&helper, "export bar/foo", false);
}

#[test]
fn wildcard_regex_matches_nested_names_like_node() {
    let helper = pending();
    parity(&helper, "export *bar/.* --verbose");
}

#[test]
fn unmatched_wildcard_does_not_export_pending_components() {
    parity(&pending(), "export */missing*");
}

#[test]
fn embedded_scope_export_matches_node() {
    let helper = pending();
    let root = &helper.scopes.local_path;
    fs::create_dir(root.join(".git")).unwrap();
    fs::rename(root.join(".bit"), root.join(".git/bit")).unwrap();
    parity(&helper, "export --verbose");
    assert!(!root.join(".bit").exists());
}

fn stage_pending(helper: &Helper) {
    let shared = crate::helper::setup::shared();
    let result = std::process::Command::new("node")
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/e2e/harmony/export_completion/pending.js"))
        .arg(&shared.node_cli)
        .arg(bit_object_import::scope_path(&helper.scopes.local_path))
        .arg(&helper.scopes.remote_path)
        .arg("resume-fixture")
        .env("HOME", shared.root.join("home"))
        .env("USERPROFILE", shared.root.join("home"))
        .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
        .output()
        .unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
}

#[test]
fn resume_multiple_main_versions_matches_node() {
    let helper = pending();
    stage_pending(&helper);
    parity(&helper, "export --resume resume-fixture --verbose");
}

#[test]
fn resume_current_lane_matches_node() {
    let helper = pending();
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    stage_pending(&helper);
    parity(&helper, "export --resume resume-fixture --verbose");
}

fn readme(helper: &Helper, missing: bool) {
    let shared = crate::helper::setup::shared();
    let result = std::process::Command::new("node")
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/e2e/harmony/export_completion/readme.js"))
        .arg(&shared.node_cli)
        .arg(&helper.scopes.local_path)
        .arg(bit_object_import::scope_path(&helper.scopes.local_path))
        .arg(missing.to_string())
        .env("HOME", shared.root.join("home"))
        .env("USERPROFILE", shared.root.join("home"))
        .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
        .output()
        .unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
}

#[test]
fn snapped_lane_readme_exports_like_node() {
    let helper = pending();
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    readme(&helper, false);
    parity(&helper, "export --verbose");
}

#[test]
fn unsnapped_lane_readme_preserves_canonical_stack_before_effects() {
    let helper = pending();
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    readme(&helper, true);
    compare(&helper, "export", false);
}

#[test]
fn missing_actual_build_artifacts_can_be_ignored_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("bar/foo.ts", "export const value: number = 1;\n");
    helper.run("add bar -i bar/foo --main foo.ts");
    helper.run("tag bar/foo --build --message first");
    let shared = crate::helper::setup::shared();
    let result = std::process::Command::new("node")
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/e2e/harmony/export_completion/artifact.js",
        ))
        .arg(&shared.node_cli)
        .arg(bit_object_import::scope_path(&helper.scopes.local_path))
        .arg(format!("{}/bar/foo", helper.scopes.remote))
        .env("HOME", shared.root.join("home"))
        .env("USERPROFILE", shared.root.join("home"))
        .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
        .output()
        .unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    parity(&helper, "export --ignore-missing-artifacts");
}

#[test]
fn scope_only_pending_component_exports_with_untracked_warning_like_node() {
    let helper = pending();
    let path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = config::read_jsonc(&path);
    bitmap
        .as_object_mut()
        .unwrap()
        .remove("bar/foo");
    config::write_json(&path, &bitmap, b"    ");
    parity(&helper, "export --verbose");
}

fn removed_pending() -> Helper {
    let helper = pending();
    crate::helper::remote::publish(&helper);
    helper.run("delete bar/foo --silent");
    helper.run("tag --unmodified --message removed");
    helper
}

#[test]
fn main_removal_export_reports_deleted_component_like_node() {
    parity(&removed_pending(), "export --verbose");
}

#[test]
fn main_removal_json_retains_published_component_ids() {
    parity(&removed_pending(), "export --json");
}

#[test]
fn exported_component_dependency_packages_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "--message dependencies");
    parity(&helper, "export --verbose");
}

#[test]
fn export_rebuilds_generated_packages_without_stale_properties() {
    let helper = pending();
    let path = helper.scopes.local_path.join(format!(
        "node_modules/@{}/bar.foo/package.json",
        helper.scopes.remote,
    ));
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    manifest["obsoleteExportFixture"] = serde_json::json!(true);
    fs::write(&path, serde_json::to_vec_pretty(&manifest).unwrap()).unwrap();
    parity(&helper, "export");
}
