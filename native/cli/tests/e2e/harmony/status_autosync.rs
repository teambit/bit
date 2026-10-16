//! Native independent startup bitmap synchronization and sentinel parity.

use crate::helper::{
    FOO_FIXTURE, Helper,
    config::{read_jsonc, set_workspace_key},
};
use serde_json::json;
use std::{ffi::OsStr, fs, process::Command};

fn workspace() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    helper.run("export");
    let old = helper.clone_workspace();
    helper.append_file("bar/foo.js", "\n// remote update");
    helper.tag_without_build("bar/foo", "");
    helper.run("export");
    helper.get_cloned_workspace(&old);
    enable(&helper);
    helper
}

fn enable(helper: &Helper) {
    let root = &helper.scopes.local_path;
    let config = read_jsonc(&root.join("workspace.jsonc"));
    let mut workspace = config["teambit.workspace/workspace"].clone();
    workspace["bitmapAutoSync"] = json!(true);
    set_workspace_key(root, "teambit.workspace/workspace", workspace);
    for args in [
        vec!["init"],
        vec![
            "-c",
            "user.name=Native",
            "-c",
            "user.email=native@example.com",
            "commit",
            "--allow-empty",
            "-m",
            "initial",
        ],
    ] {
        let output = Command::new("git")
            .args(args)
            .current_dir(root)
            .output()
            .unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    }
}

fn parity(command: &str, ci: bool) {
    qualify(&workspace(), command, ci);
}

fn qualify(helper: &Helper, command: &str, ci: bool) {
    let copy = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new(if ci { "true" } else { "" }))],
    );
    assert!(node.status.success(), "{}", node.stderr);
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let sentinel = fs::read(helper.scopes.local_path.join(".bit/last-pull-sync")).unwrap();
    helper.get_cloned_workspace(&copy);
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("CI", OsStr::new(if ci { "true" } else { "" }))],
    );
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        String::from_utf8(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap()).unwrap(),
        String::from_utf8(bitmap).unwrap(),
    );
    assert_eq!(fs::read(helper.scopes.local_path.join(".bit/last-pull-sync")).unwrap(), sentinel);
    let second = helper.native_run("status --json");
    assert!(!second.stdout.contains("bitmapAutoSync: synced"));
}

#[test]
fn startup_autosync_matches_node_bitmap_and_sentinel() {
    parity("status --json", false);
}
#[test]
fn startup_autosync_matches_node_text() {
    parity("status", false);
}
#[test]
fn startup_autosync_matches_node_ci_text() {
    parity("status", true);
}
#[test]
fn startup_autosync_matches_node_diff() {
    parity("diff bar/foo --json", false);
}

#[test]
fn startup_autosync_fetch_failure_keeps_sentinel_for_retry() {
    let helper = workspace();
    fs::write(helper.scopes.remote_path.join("scope.json"), b"{malformed").unwrap();
    let copy = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "status",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{}", node.stderr);
    assert!(!helper.scopes.local_path.join(".bit/last-pull-sync").exists());
    helper.get_cloned_workspace(&copy);
    let native = helper.native_run("status");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(!helper.scopes.local_path.join(".bit/last-pull-sync").exists());
}

#[test]
fn startup_autosync_failure_after_publication_cannot_delegate() {
    let helper = workspace();
    let output = helper.cmd("diff missing/component --json");
    assert!(output.native, "{}", output.trace);
    assert_eq!(output.status.code(), Some(1));
    assert!(helper.scopes.local_path.join(".bit/last-pull-sync").exists());
}

#[test]
fn startup_autosync_promotes_new_unscoped_bitmap_entry() {
    let helper = workspace();
    let path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = read_jsonc(&path);
    let row = bitmap
        .as_object_mut()
        .unwrap()
        .values_mut()
        .find(|row| row["name"] == "bar/foo")
        .unwrap();
    row["scope"] = json!("");
    row["version"] = json!("");
    row["defaultScope"] = json!(helper.scopes.remote);
    crate::helper::config::write_json(&path, &bitmap, b"    ");
    qualify(&helper, "status --json", false);
}

#[test]
fn startup_autosync_resolves_packed_git_refs() {
    let helper = workspace();
    let output = Command::new("git")
        .args(["pack-refs", "--all"])
        .current_dir(&helper.scopes.local_path)
        .output()
        .unwrap();
    assert!(output.status.success());
    qualify(&helper, "status --json", false);
}

#[test]
fn startup_autosync_matches_node_quick_json() {
    parity("status --quick --json", false);
}
#[test]
fn startup_autosync_matches_node_quick_text() {
    parity("status --quick", false);
}
#[test]
fn mini_status_does_not_run_startup_autosync() {
    let helper = workspace();
    let original = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let copy = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "mini-status --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{}", node.stderr);
    helper.get_cloned_workspace(&copy);
    let native = helper.native_run("mini-status --json");
    assert_eq!(native.stdout, node.stdout);
    assert!(!helper.scopes.local_path.join(".bit/last-pull-sync").exists());
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), original);
}

#[test]
fn startup_autosync_keeps_original_version_dependency_closure() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    helper.run("export");
    let old = helper.clone_workspace();
    helper.append_file("comp1/index.js", "\n// remote root update");
    helper.append_file("comp2/index.js", "\n// remote dependency update");
    helper.tag_without_build("", "");
    helper.run("export");
    let head = remote_head(&helper, "comp2");
    helper.get_cloned_workspace(&old);
    let path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = read_jsonc(&path);
    bitmap
        .as_object_mut()
        .unwrap()
        .retain(|_, row| row["name"] != "comp2");
    crate::helper::config::write_json(&path, &bitmap, b"    ");
    enable(&helper);
    let copy = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "status --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{}", node.stderr);
    let dependency =
        helper.scopes.local_path.join(format!(".bit/objects/{}/{}", &head[..2], &head[2..]));
    let fetched = dependency.is_file();
    let index = read_jsonc(&helper.scopes.local_path.join(".bit/index.json"));
    helper.get_cloned_workspace(&copy);
    let native = helper.native_run("status --json");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(
        dependency.is_file(),
        fetched,
        "native must preserve Node dependency closure selection",
    );
    assert_eq!(read_jsonc(&helper.scopes.local_path.join(".bit/index.json")), index);
}

fn remote_head(helper: &Helper, name: &str) -> String {
    use sha1::{Digest, Sha1};
    use std::io::Read as _;
    let identity = format!("{}/{name}", helper.scopes.remote);
    let hash = format!("{:x}", Sha1::digest(identity.as_bytes()));
    let file = fs::File::open(helper.scopes.remote_path.join(format!(
        "objects/{}/{}",
        &hash[..2],
        &hash[2..],
    )))
    .unwrap();
    let mut bytes = Vec::new();
    flate2::read::ZlibDecoder::new(file).read_to_end(&mut bytes).unwrap();
    let body = bytes
        .splitn(2, |byte| *byte == 0)
        .nth(1)
        .unwrap();
    serde_json::from_slice::<serde_json::Value>(body).unwrap()["head"]
        .as_str()
        .unwrap()
        .to_owned()
}
