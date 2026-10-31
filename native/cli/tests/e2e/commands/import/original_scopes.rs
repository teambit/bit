//! The released `fetch --from-original-scopes` flag is accepted but ignored:
//! `FetchCmd` declares the plural option yet reads the singular `fromOriginalScope`.
use super::{
    Duration, Helper, OsStr, ScopeServer, Stdio, TcpListener, TcpStream, fs, setup, thread,
    without_progress_timing,
};
use crate::helper::config;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::path::Path;

fn add_remote(workspace: &Path, name: &str, path: &Path) {
    config::update_scope_json(&workspace.join(".bit/scope.json"), |scope| {
        let remotes = scope
            .entry("remotes")
            .or_insert_with(|| json!({}));
        remotes[name] = Value::String(format!("file://{}", path.display()));
    });
}

fn fixture() -> (Helper, Helper) {
    let original = Helper::new();
    original.set_workspace_with_remote_scope();
    original.populate_components(1, false, "");
    original.tag_without_build("", "--message dependency");
    crate::helper::remote::seed_after_node_export(&original);
    let dependent = Helper::new();
    dependent.set_workspace_with_remote_scope();
    add_remote(&dependent.scopes.local_path, &original.scopes.remote, &original.scopes.remote_path);
    dependent.run(&format!("import {}/comp1 -x", original.scopes.remote));
    dependent.output_file(
        "alpha/index.js",
        &format!("module.exports = require('../{}/comp1');", original.scopes.remote),
    );
    dependent.run("add alpha");
    dependent.run("link --rewire");
    dependent.run("compile");
    dependent.tag_without_build("alpha", "--message dependent");
    crate::helper::remote::seed_after_node_export(&dependent);
    let id = format!("{}/comp1", original.scopes.remote);
    let hash = format!("{:x}", Sha1::digest(id.as_bytes()));
    let cached = dependent.scopes.remote_path
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    assert!(cached.exists(), "dependent remote must initially cache the original model");
    fs::remove_file(cached).unwrap();
    dependent.re_init_workspace();
    dependent.add_remote_scope();
    add_remote(&dependent.scopes.local_path, &original.scopes.remote, &original.scopes.remote_path);
    (dependent, original)
}

fn serve(scope: &Path) -> (ScopeServer, String) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let child = setup::bit_command(setup::shared(), scope)
        .args([
            "start",
            "--port",
            &port.to_string(),
            "--skip-ui-build",
            "--no-browser",
            "--skip-compilation",
        ])
        .env("BIT_NATIVE", "off")
        .env("CI", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut server = ScopeServer(child);
    let ready = (0..300).any(|_| {
        if server.0.try_wait().unwrap().is_some() {
            return false;
        }
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
        false
    });
    assert!(ready, "released HTTP scope server did not start");
    (server, format!("http://127.0.0.1:{port}"))
}

fn compare(dependent: &Helper, original: &Helper) {
    let node_root = dependent.clone_workspace();
    let dependent_before = dependent.clone_remote_scope();
    let original_before = dependent.clone_remote_at(&original.scopes.remote_path);
    let command =
        format!("fetch {}/alpha --components --from-original-scopes", dependent.scopes.remote);
    let node = Helper::cmd_in_with(
        &node_root,
        &command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    let node_dependent_remote = super::authored_install::tree(&dependent.scopes.remote_path);
    let node_original_remote = super::authored_install::tree(&original.scopes.remote_path);
    dependent.restore_remote_scope(&dependent_before);
    Helper::restore_remote_at(&original.scopes.remote_path, &original_before);
    let native =
        Helper::cmd_in_with(&dependent.scopes.local_path, &command, &[("CI", OsStr::new("1"))]);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    super::authored_install::assert_same_tree(&dependent.scopes.local_path, &node_root);
    super::authored_install::assert_tree_maps(
        &super::authored_install::tree(&dependent.scopes.remote_path),
        &node_dependent_remote,
    );
    super::authored_install::assert_tree_maps(
        &super::authored_install::tree(&original.scopes.remote_path),
        &node_original_remote,
    );
}

#[test]
fn original_scope_flag_preserves_released_file_fetch_state() {
    let (dependent, original) = fixture();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_FETCH_ORIGINAL_SCOPES_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&dependent.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&dependent.scopes.remote_path, &destination.join("dependent-remote"));
        setup::copy_dir(&original.scopes.remote_path, &destination.join("original-remote"));
    }
    compare(&dependent, &original);
}

#[test]
fn original_scope_flag_preserves_released_http_fetch_state() {
    let (dependent, original) = fixture();
    let (_dependent_server, dependent_url) = serve(&dependent.scopes.remote_path);
    let (_original_server, original_url) = serve(&original.scopes.remote_path);
    config::update_scope_json(&dependent.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"][&dependent.scopes.remote] = Value::String(dependent_url);
        scope["remotes"][&original.scopes.remote] = Value::String(original_url);
    });
    compare(&dependent, &original);
}

#[test]
fn ignored_original_scope_flag_does_not_contact_unavailable_http_scope() {
    let (dependent, original) = fixture();
    let (_dependent_server, dependent_url) = serve(&dependent.scopes.remote_path);
    let (original_server, original_url) = serve(&original.scopes.remote_path);
    config::update_scope_json(&dependent.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"][&dependent.scopes.remote] = Value::String(dependent_url);
        scope["remotes"][&original.scopes.remote] = Value::String(original_url);
    });
    drop(original_server);
    compare(&dependent, &original);
}
