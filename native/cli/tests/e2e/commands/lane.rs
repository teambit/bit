//! Client-side lane creation from a clean main workspace.
mod staged;
use crate::helper::{Helper, config, parse, remote, setup};
use flate2::read::ZlibDecoder;
use sha1::{Digest, Sha1};
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs,
    io::Read,
    net::{TcpListener, TcpStream},
    path::Path,
    process::{Child, Stdio},
    thread,
    time::Duration,
};

struct RemoteScopeServer(Child);

impl Drop for RemoteScopeServer {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn lane_import_on_main_and_same_lane_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let command = format!("lane import {}/dev -x", helper.scopes.remote);
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(node.status.success());
    let repeat_node =
        Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let repeat_native = helper.native_run(&command);
    assert!(repeat_native.native, "{}", repeat_native.trace);
    assert_eq!(repeat_native.status.code(), repeat_node.status.code());
    assert_eq!(repeat_native.stdout, repeat_node.stdout);
    assert_eq!(repeat_native.stderr, repeat_node.stderr);
    let node_lanes =
        Helper::cmd_in_with(&node_root, "lane list --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_lanes = helper.native_run("lane list --json");
    assert_eq!(parse(&native_lanes.stdout), parse(&node_lanes.stdout));
}

#[test]
fn lane_import_from_another_lane_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    remote::publish(&helper);
    let producer = helper.clone_workspace();
    helper.native("switch main -x");
    helper.native("lane create other");
    fs::write(producer.join("bar/foo.js"), "module.exports = () => 'advanced';").unwrap();
    let snap = Helper::cmd_in_with(
        &producer,
        "snap bar/foo --message advance",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(snap.status.success(), "{} {}", snap.stdout, snap.stderr);
    remote::publish_at(&helper, &producer);
    let node_root = helper.clone_workspace();
    let native_file = fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    let native_bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let command = format!("lane import {}/dev -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success());
    assert_eq!(fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(), native_file);
    assert_eq!(fs::read(node_root.join("bar/foo.js")).unwrap(), native_file);
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), native_bitmap);
    assert_eq!(fs::read(node_root.join(".bitmap")).unwrap(), native_bitmap);
    let node_lanes =
        Helper::cmd_in_with(&node_root, "lane list --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_lanes = helper.native_run("lane list --json");
    assert_eq!(parse(&native_lanes.stdout), parse(&node_lanes.stdout));
    let node_current = Helper::cmd_in_with(
        &node_root,
        "lane current --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native_current = helper.native_run("lane current --json");
    assert_eq!(parse(&native_current.stdout), parse(&node_current.stdout));
}

#[test]
fn local_lane_remove_moves_lane_to_trash_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    helper.native("switch main -x");
    let node_root = helper.clone_workspace();
    let before_index: serde_json::Value = serde_json::from_slice(
        &fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(),
    )
    .unwrap();
    let hash = before_index["lanes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|lane| lane["id"]["name"] == "dev")
        .unwrap()["hash"]
        .as_str()
        .unwrap();
    let command = "lane remove dev --silent --force";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success());
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(),
        fs::read(node_root.join(".bit/index.json")).unwrap(),
    );
    let native_lanes = helper.native_run("lane list --json");
    let node_lanes =
        Helper::cmd_in_with(&node_root, "lane list --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(parse(&native_lanes.stdout), parse(&node_lanes.stdout));
    let trash = format!(".bit/trash/{}/{}", &hash[..2], &hash[2..]);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&trash)).unwrap(),
        fs::read(node_root.join(trash)).unwrap(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
}

#[test]
fn local_lane_remove_merged_batch_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for name in ["first", "second"] {
        helper.native(&format!("lane create {name}"));
        helper.native("switch main -x");
    }
    let node_root = helper.clone_workspace();
    let command = "lane remove first second --silent";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success());
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(),
        fs::read(node_root.join(".bit/index.json")).unwrap(),
    );
}

#[test]
fn local_lane_remove_current_lane_declines_without_writing() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    let before = fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap();
    let command = "lane remove dev --silent --force";
    let result = helper.cmd(command);
    assert!(!result.native, "{}", result.trace);
    assert!(!result.status.success());
    assert_eq!(fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(), before);
}

#[test]
fn http_remote_lane_inspection_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    remote::publish(&helper);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let server = setup::bit_command(setup::shared(), &helper.scopes.remote_path)
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
    let mut server = RemoteScopeServer(server);
    // Node's scope server can take longer than 30 seconds on loaded Windows runners.
    let ready = (0..900).any(|_| {
        if server.0.try_wait().unwrap().is_some() {
            return false;
        }
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
        false
    });
    assert!(ready);
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"][&helper.scopes.remote] =
            serde_json::json!(format!("http://127.0.0.1:{port}"));
    });
    if let Some(destination) = std::env::var_os("BIT_NATIVE_HTTP_LANE_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
        setup::copy_dir(&setup::shared().root.join("home"), &destination.join("home"));
        setup::copy_dir(&setup::shared().root.join("globals"), &destination.join("globals"));
    }
    for command in [
        format!("lane list --remote {} --json", helper.scopes.remote),
        format!("lane list --remote {}", helper.scopes.remote),
        format!("lane list --remote {} --details", helper.scopes.remote),
        format!("lane list --remote {} --merged --json", helper.scopes.remote),
        format!("lane list --remote {} --merged", helper.scopes.remote),
        format!("lane list --remote {} --not-merged", helper.scopes.remote),
        "lane show dev --remote --json".to_owned(),
        "lane show dev --remote".to_owned(),
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(
            node.status.success(),
            "{command}: stdout: {}\nstderr: {}",
            node.stdout,
            node.stderr,
        );
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    let node_root = helper.clone_workspace();
    let command = format!("lane import {}/dev -x", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn configured_file_remote_lane_inspection_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    remote::publish(&helper);
    let remote = &helper.scopes.remote;
    for command in [
        format!("lane list --remote {remote} --json"),
        format!("lane list --remote {remote} --details"),
        "lane show dev --remote --json".to_owned(),
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    helper.native("switch main -x");
    for command in [
        format!("lane list --remote {remote}"),
        format!("lane list --remote {remote} --details"),
        format!("lane list --remote {remote} --json"),
        format!("lane list --remote {remote} --merged"),
        format!("lane list --remote {remote} --not-merged --json"),
        "lane show dev --remote".to_owned(),
        format!("lane show {remote}/dev --remote --json"),
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
    helper.run("lane merge dev -x");
    remote::publish(&helper);
    for command in [
        format!("lane list --remote {remote} --merged --json"),
        format!("lane list --remote {remote} --not-merged"),
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(&command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
}

#[test]
fn lane_inspection_keeps_hidden_update_dependents_out_of_visible_components() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap comp2 --skip-auto-snap --unmodified --message lane");
    remote::publish(&helper);
    helper.seed_hidden_update_dependent(
        &format!("{}/comp1", helper.scopes.remote),
        &format!("{}/dev", helper.scopes.remote),
    );
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/dev -x", helper.scopes.remote));
    for command in ["lane list", "lane list --details", "lane list --json", "lane show dev --json"]
    {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        if command.ends_with("--json") {
            assert_eq!(parse(&native.stdout), parse(&node.stdout), "{command}");
        } else {
            assert_eq!(native.stdout, node.stdout, "{command}");
        }
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
}

#[test]
fn lane_merged_filters_follow_main_head_ancestry() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    remote::publish(&helper);
    helper.native("lane create dev");
    assert_lane_filters_match_node(&helper);
    helper.native("snap --unmodified --message lane");
    if let Some(destination) = std::env::var_os("BIT_NATIVE_LANE_LIST_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        setup::copy_dir(&helper.scopes.local_path, &destination);
    }
    assert_lane_filters_match_node(&helper);
    helper.native("switch main");
    helper.run("lane merge dev -x");
    assert_lane_filters_match_node(&helper);
}

fn assert_lane_filters_match_node(helper: &Helper) {
    for command in [
        "lane list --merged",
        "lane list --not-merged",
        "lane list --merged --json",
        "lane list --not-merged --json",
    ] {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(command);
        assert!(native.native, "{command}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        if command.ends_with("--json") {
            assert_eq!(parse(&native.stdout), parse(&node.stdout), "{command}");
        } else {
            assert_eq!(native.stdout, node.stdout, "{command}");
        }
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
}

fn object(root: &Path, hash: &str, kind: &str) -> serde_json::Value {
    let path = root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let mut bytes = Vec::new();
    ZlibDecoder::new(fs::File::open(path).unwrap()).read_to_end(&mut bytes).unwrap();
    assert!(bytes.starts_with(format!("{kind} {hash} ").as_bytes()));
    parse(
        std::str::from_utf8(
            bytes
                .split(|byte| *byte == 0)
                .nth(1)
                .unwrap(),
        )
        .unwrap(),
    )
}

fn create_case(command: &str) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    for path in [".bitmap", ".bit/scope.json"] {
        let native = fs::read_to_string(helper.scopes.local_path.join(path)).unwrap();
        let node = fs::read_to_string(node_root.join(path)).unwrap();
        let native = parse(&native[native.find('{').unwrap()..]);
        let node = parse(&node[node.find('{').unwrap()..]);
        assert_eq!(native, node, "{path}");
    }
    let node_index = parse(&fs::read_to_string(node_root.join(".bit/index.json")).unwrap());
    let native_index =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap());
    assert_eq!(
        native_index["lanes"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(native_index["lanes"][0]["id"], node_index["lanes"][0]["id"]);
    let native_hash = native_index["lanes"][0]["hash"].as_str().unwrap();
    let node_hash = node_index["lanes"][0]["hash"].as_str().unwrap();
    let native_lane = object(&helper.scopes.local_path, native_hash, "Lane");
    let node_lane = object(&node_root, node_hash, "Lane");
    for field in ["name", "scope", "components", "schema"] {
        assert_eq!(native_lane[field], node_lane[field], "Lane.{field}");
    }
    let native_history_hash =
        format!("{:x}", Sha1::digest(format!("{native_hash}:LaneHistory").as_bytes()));
    let node_history_hash =
        format!("{:x}", Sha1::digest(format!("{node_hash}:LaneHistory").as_bytes()));
    let native_history = object(&helper.scopes.local_path, &native_history_hash, "LaneHistory");
    let node_history = object(&node_root, &node_history_hash, "LaneHistory");
    assert_eq!(native_history["laneHash"], native_hash);
    for field in ["name", "scope"] {
        assert_eq!(native_history[field], node_history[field]);
    }
    assert_eq!(
        native_history["history"]
            .as_object()
            .unwrap()
            .len(),
        1,
    );
    let entry = native_history["history"]
        .as_object()
        .unwrap()
        .values()
        .next()
        .unwrap();
    assert_eq!(entry["log"]["message"], "new lane");
    assert_eq!(entry["components"], serde_json::json!([]));
    assert_eq!(entry["updateDependents"], serde_json::json!([]));
    let node_current = Helper::cmd_in_with(
        &node_root,
        "lane current --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native_current = helper.native_run("lane current --json");
    assert_eq!(parse(&native_current.stdout), parse(&node_current.stdout));
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_status = helper.native_run("status --json");
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn local_history_reports_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    let node_root = helper.clone_workspace();
    let history = object(
        &helper.scopes.local_path,
        &{
            let index = parse(
                &fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap(),
            );
            let lane_hash = index["lanes"][0]["hash"].as_str().unwrap();
            format!("{:x}", Sha1::digest(format!("{lane_hash}:LaneHistory").as_bytes()))
        },
        "LaneHistory",
    );
    let id = history["history"]
        .as_object()
        .unwrap()
        .keys()
        .next()
        .unwrap();
    for command in [
        "lane history".to_string(),
        "lane history --json".to_string(),
        format!("lane history --id {id}"),
        format!("lane history --id {id} --json"),
    ] {
        let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{command}: {}", node.stderr);
        let native = helper.native_run(&command);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
    }
}

#[test]
fn remote_history_refresh_matches_published_node_full_state() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'lane history';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    crate::helper::remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message remote-history");
    crate::helper::remote::publish(&helper);
    let index =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap());
    let lane_hash = index["lanes"][0]["hash"].as_str().unwrap();
    let history_hash = format!("{:x}", Sha1::digest(format!("{lane_hash}:LaneHistory").as_bytes()));
    let local_history = helper.scopes.local_path
        .join(".bit/objects")
        .join(&history_hash[..2])
        .join(&history_hash[2..]);
    assert!(local_history.is_file());
    fs::remove_file(local_history).unwrap();
    let native_root = helper.clone_workspace();
    let node_root = helper.clone_workspace();
    let before_remote = state(&helper.scopes.remote_path);
    for command in ["lane history --json", "lane history"] {
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(node.status.success(), "{command}: {}", node.stderr);
        let native = Helper::cmd_in_with(&native_root, command, &[]);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_state_maps(&state(&native_root), &state(&node_root), command);
        assert_eq!(command_history(&native_root), command_history(&node_root));
        assert_state_maps(&state(&helper.scopes.remote_path), &before_remote, command);
    }
}

#[test]
fn bare_scope_lane_inspection_matches_published_node_full_state() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'bare lane';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    crate::helper::remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message bare-lane");
    crate::helper::remote::publish(&helper);
    let native_scope = helper.scopes.remote_path.clone();
    let node_scope = helper.clone_remote_scope();
    for command in ["lane list --json", "lane show dev --json"] {
        let node = Helper::cmd_in_with(&node_scope, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = Helper::cmd_in_with(&native_scope, command, &[]);
        assert!(native.native, "{command}: {}", native.trace);
        assert!(node.status.success(), "{command}: {}", node.stderr);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_state_maps(&state(&native_scope), &state(&node_scope), command);
        assert_eq!(command_history(&native_scope), command_history(&node_scope), "{command}");
    }
    let observer = helper.scopes.e2e_dir.join("bare-lane-observer");
    setup::copy_dir(&setup::shared().bare_scope_template, &observer);
    config::update_scope_json(&observer.join("scope.json"), |scope| {
        scope.insert("name".into(), serde_json::json!("bare-lane-observer"));
        scope
            .entry("remotes")
            .or_insert_with(|| serde_json::json!({}))[&helper.scopes.remote] =
            serde_json::json!(format!("file://{}", native_scope.display()));
    });
    let node_observer = helper.scopes.e2e_dir.join("bare-lane-observer-node");
    setup::copy_dir(&observer, &node_observer);
    let globals = helper.scopes.e2e_dir.join("bare-lane-globals");
    fs::create_dir_all(globals.join("config")).unwrap();
    fs::copy(
        setup::shared().root.join("globals/config/config.json"),
        globals.join("config/config.json"),
    )
    .unwrap();
    let mut remotes = serde_json::json!({});
    remotes[&helper.scopes.remote] =
        serde_json::json!(format!("file://{}", native_scope.display()));
    fs::write(globals.join("config/global-remotes.json"), remotes.to_string()).unwrap();
    for command in [
        format!("lane list --remote {} --json", helper.scopes.remote),
        format!("lane show {}/dev --remote --json", helper.scopes.remote),
    ] {
        let node = Helper::cmd_in_with(
            &node_observer,
            &command,
            &[("BIT_NATIVE", OsStr::new("off")), ("BIT_GLOBALS_DIR", globals.as_os_str())],
        );
        let native =
            Helper::cmd_in_with(&observer, &command, &[("BIT_GLOBALS_DIR", globals.as_os_str())]);
        assert!(native.native, "{command}: {}", native.trace);
        assert!(node.status.success(), "{command}: {}", node.stderr);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_state_maps(&state(&observer), &state(&node_observer), &command);
    }
    assert_state_maps(&state(&native_scope), &state(&node_scope), "bare scope inspection");
}

#[test]
fn bare_scope_lane_history_refresh_matches_published_node_full_state() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'bare history base';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    crate::helper::remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message first-bare-history");
    crate::helper::remote::publish(&helper);
    let native_scope = helper.clone_remote_scope();
    let node_scope = helper.clone_remote_scope();
    for scope_root in [&native_scope, &node_scope] {
        config::update_scope_json(&scope_root.join("scope.json"), |scope| {
            scope
                .entry("remotes")
                .or_insert_with(|| serde_json::json!({}))
                [&helper.scopes.remote] =
                serde_json::json!(format!("file://{}", helper.scopes.remote_path.display()));
        });
    }
    fs::write(
        helper.scopes.local_path.join("bar/foo.js"),
        "module.exports = 'bare history advance';",
    )
    .unwrap();
    helper.native("snap bar/foo --message second-bare-history");
    crate::helper::remote::publish(&helper);
    let before_remote = state(&helper.scopes.remote_path);
    for command in ["lane history dev --json", "lane history dev"] {
        let node = Helper::cmd_in_with(&node_scope, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = Helper::cmd_in_with(&native_scope, command, &[]);
        assert!(native.native, "{command}: {}", native.trace);
        assert!(node.status.success(), "{command}: {}", node.stderr);
        assert_eq!(native.status.code(), node.status.code(), "{command}");
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr, "{command}");
        assert_state_maps(&state(&native_scope), &state(&node_scope), command);
        assert_eq!(command_history(&native_scope), command_history(&node_scope), "{command}");
        assert_state_maps(&state(&helper.scopes.remote_path), &before_remote, command);
    }
}

#[test]
fn absent_remote_lane_after_custom_resolver_is_owned_once() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let native_scope = helper.scopes.e2e_dir.join("lane-resolver-native");
    setup::copy_dir(&helper.scopes.local_path, &native_scope);
    let resolver = native_scope.join("resolver.cjs");
    fs::write(&resolver, format!(
        r"const fs=require('fs');module.exports=async()=>{{fs.appendFileSync(process.cwd()+'/resolver-count','called\n');return {};}};",
        serde_json::json!(format!("file://{}", helper.scopes.remote_path.display())),
    )).unwrap();
    config::update_scope_json(&native_scope.join(".bit/scope.json"), |scope| {
        scope.insert("remotes".into(), serde_json::json!({}));
        scope.insert("resolverPath".into(), serde_json::json!(resolver));
    });
    let node_scope = helper.scopes.e2e_dir.join("lane-resolver-node");
    setup::copy_dir(&native_scope, &node_scope);
    let command = format!("lane show {}/absent --remote", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_scope, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = Helper::cmd_in_with(&native_scope, &command, &[]);
    assert!(native.native, "{}", native.trace);
    assert!(!node.status.success());
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(fs::read_to_string(native_scope.join("resolver-count")).unwrap(), "called\n");
    assert_eq!(fs::read_to_string(node_scope.join("resolver-count")).unwrap(), "called\n");
    assert_state_maps(&state(&native_scope), &state(&node_scope), "resolver failure");
}

fn state(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn visit(root: &Path, dir: &Path, rows: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let key = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            if key == ".bit/command-history" || key == "command-history" {
                continue;
            }
            let metadata = fs::symlink_metadata(&path).unwrap();
            rows.insert(format!("{key}:mode"), file_mode(&metadata));
            let bytes = entry_bytes(root, &path, &metadata, &key);
            rows.insert(key, bytes);
            if metadata.is_dir() {
                visit(root, &path, rows);
            }
        }
    }
    let mut rows = BTreeMap::new();
    visit(root, root, &mut rows);
    rows
}

fn entry_bytes(root: &Path, path: &Path, metadata: &fs::Metadata, key: &str) -> Vec<u8> {
    if metadata.file_type().is_symlink() {
        let target = fs::read_link(path).unwrap();
        let target = target
            .strip_prefix(root)
            .map_or_else(
                |_| target.to_string_lossy().into_owned(),
                |relative| format!("<WORKSPACE>/{}", relative.display()),
            );
        return format!("symlink:{target}").into_bytes();
    }
    if metadata.is_dir() {
        return b"directory".to_vec();
    }
    if key.starts_with(".bit/objects/") || key.starts_with("objects/") {
        let mut bytes = Vec::new();
        ZlibDecoder::new(fs::File::open(path).unwrap()).read_to_end(&mut bytes).unwrap();
        return bytes;
    }
    fs::read(path).unwrap()
}

fn assert_state_maps(
    actual: &BTreeMap<String, Vec<u8>>,
    expected: &BTreeMap<String, Vec<u8>>,
    command: &str,
) {
    for key in actual.keys().chain(expected.keys()) {
        assert!(
            actual.get(key) == expected.get(key),
            "{command}: path {key} differs: native {}, Node {}",
            state_summary(actual.get(key)),
            state_summary(expected.get(key)),
        );
    }
}

fn state_summary(value: Option<&Vec<u8>>) -> String {
    match value {
        None => "absent".to_owned(),
        Some(bytes) => format!("{} bytes {:?}", bytes.len(), &bytes[..bytes.len().min(96)]),
    }
}

#[cfg(unix)]
fn file_mode(metadata: &fs::Metadata) -> Vec<u8> {
    use std::os::unix::fs::PermissionsExt;
    (metadata.permissions().mode() & 0o7777).to_le_bytes().to_vec()
}

#[cfg(not(unix))]
fn file_mode(metadata: &fs::Metadata) -> Vec<u8> {
    vec![u8::from(metadata.permissions().readonly())]
}

fn command_history(root: &Path) -> Vec<String> {
    let path = if root.join("scope.json").is_file() {
        root.join("command-history")
    } else {
        root.join(".bit/command-history")
    };
    fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .map(|line| {
            line.splitn(3, ' ')
                .nth(2)
                .unwrap_or_default()
                .to_owned()
        })
        .collect()
}

#[test]
fn local_alias_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    let node_root = helper.clone_workspace();
    let command = "lane alias dev work";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let native_config =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/scope.json")).unwrap());
    let node_config = parse(&fs::read_to_string(node_root.join(".bit/scope.json")).unwrap());
    assert_eq!(native_config, node_config);
    for command in ["lane current --json", "lane list --json", "lane show work --json"] {
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(command);
        assert_eq!(native.stdout, node.stdout, "{command}");
    }
}

fn metadata_change_case(command: &str, with_component: bool) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    if with_component {
        helper.create_component_bar_foo("// lane component");
        helper.add_component_bar_foo();
        helper.native("snap --message on-lane");
    }
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{command}: {}", node.stderr);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    for path in [".bitmap", ".bit/scope.json", ".bit/index.json"] {
        let native = fs::read_to_string(helper.scopes.local_path.join(path)).unwrap();
        let node = fs::read_to_string(node_root.join(path)).unwrap();
        assert_eq!(
            parse(&native[native.find('{').unwrap()..]),
            parse(&node[node.find('{').unwrap()..]),
            "{path}",
        );
    }
    let index =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap());
    let lane_hash = index["lanes"][0]["hash"].as_str().unwrap();
    let history_hash = format!("{:x}", Sha1::digest(format!("{lane_hash}:LaneHistory").as_bytes()));
    let native_lane = object(&helper.scopes.local_path, lane_hash, "Lane");
    let node_lane = object(&node_root, lane_hash, "Lane");
    assert_eq!(native_lane, node_lane);
    let native_history = object(&helper.scopes.local_path, &history_hash, "LaneHistory");
    let node_history = object(&node_root, &history_hash, "LaneHistory");
    assert_eq!(native_history["name"], node_history["name"]);
    assert_eq!(native_history["scope"], node_history["scope"]);
    assert_eq!(
        native_history["history"]
            .as_object()
            .unwrap()
            .len(),
        node_history["history"]
            .as_object()
            .unwrap()
            .len(),
    );
    let native_last = native_history["history"]
        .as_object()
        .unwrap()
        .values()
        .next_back()
        .unwrap();
    let node_last = node_history["history"]
        .as_object()
        .unwrap()
        .values()
        .next_back()
        .unwrap();
    assert_eq!(native_last["log"]["message"], node_last["log"]["message"]);
    assert_eq!(native_last["components"], node_last["components"]);
    assert_eq!(native_last["updateDependents"], node_last["updateDependents"]);
    for command in ["lane current --json", "lane list --json"] {
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(command);
        assert_eq!(parse(&native.stdout), parse(&node.stdout), "{command}");
    }
}

#[test]
fn local_rename_matches_node() {
    metadata_change_case("lane rename renamed", false);
}

#[test]
fn local_scope_change_matches_node() {
    metadata_change_case("lane change-scope another-scope", false);
}

#[test]
fn local_rename_with_component_matches_node() {
    metadata_change_case("lane rename renamed", true);
}

#[test]
fn local_scope_change_with_component_matches_node() {
    metadata_change_case("lane change-scope another-scope", true);
}

#[test]
fn create_from_main_matches_node() {
    create_case("lane create dev");
}

#[test]
fn create_with_scope_and_alias_matches_node() {
    create_case("lane create dev --scope separate-scope --alias mydev");
}

#[test]
fn create_after_export_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("// lane base");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    remote::publish(&helper);
    let node_root = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&node_root, "lane create dev", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let native = helper.native_run("lane create dev");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let native_index =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap());
    let node_index = parse(&fs::read_to_string(node_root.join(".bit/index.json")).unwrap());
    assert_eq!(native_index["components"], node_index["components"]);
    assert_eq!(native_index["lanes"][0]["id"], node_index["lanes"][0]["id"]);
    let native_status = helper.native_run("status --json");
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn create_from_an_unexported_lane_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create parent");
    let node_root = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&node_root, "lane create child", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let native = helper.native_run("lane create child");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    for path in [".bitmap", ".bit/scope.json"] {
        let native = fs::read_to_string(helper.scopes.local_path.join(path)).unwrap();
        let node = fs::read_to_string(node_root.join(path)).unwrap();
        assert_eq!(
            parse(&native[native.find('{').unwrap()..]),
            parse(&node[node.find('{').unwrap()..]),
        );
    }
    let index =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap());
    let node_index = parse(&fs::read_to_string(node_root.join(".bit/index.json")).unwrap());
    assert_eq!(index["lanes"].as_array().unwrap().len(), 2);
    assert_eq!(index["lanes"][1]["id"], node_index["lanes"][1]["id"]);
    let hash = index["lanes"][1]["hash"].as_str().unwrap();
    let lane = object(&helper.scopes.local_path, hash, "Lane");
    let node_hash = node_index["lanes"][1]["hash"].as_str().unwrap();
    let node_lane = object(&node_root, node_hash, "Lane");
    assert_eq!(lane["forkedFrom"], node_lane["forkedFrom"]);
    assert_eq!(lane["components"], node_lane["components"]);
}

#[test]
fn create_from_an_exported_lane_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create parent");
    helper.create_component_bar_foo("// on parent");
    helper.add_component_bar_foo();
    helper.native("snap --message parent");
    remote::publish(&helper);
    let node_root = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&node_root, "lane create child", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let native = helper.native_run("lane create child");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let index =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap());
    let node_index = parse(&fs::read_to_string(node_root.join(".bit/index.json")).unwrap());
    let hash = index["lanes"][1]["hash"].as_str().unwrap();
    let node_hash = node_index["lanes"][1]["hash"].as_str().unwrap();
    let lane = object(&helper.scopes.local_path, hash, "Lane");
    let node_lane = object(&node_root, node_hash, "Lane");
    assert_eq!(lane["forkedFrom"], node_lane["forkedFrom"]);
    assert_eq!(lane["components"], node_lane["components"]);
    let native_status = helper.native_run("status --json");
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn create_cross_scope_fork_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create parent");
    helper.create_component_bar_foo("// on parent");
    helper.add_component_bar_foo();
    helper.native("snap --message parent");
    remote::publish(&helper);
    let node_root = helper.clone_workspace();
    let command = "lane create child --scope other-scope --fork-lane-new-scope";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}", node.stderr);
    let native = helper.native_run(command);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let index =
        parse(&fs::read_to_string(helper.scopes.local_path.join(".bit/index.json")).unwrap());
    let node_index = parse(&fs::read_to_string(node_root.join(".bit/index.json")).unwrap());
    assert_eq!(index["lanes"][1]["id"], node_index["lanes"][1]["id"]);
    let hash = index["lanes"][1]["hash"].as_str().unwrap();
    let node_hash = node_index["lanes"][1]["hash"].as_str().unwrap();
    let lane = object(&helper.scopes.local_path, hash, "Lane");
    let node_lane = object(&node_root, node_hash, "Lane");
    assert_eq!(lane["forkedFrom"], node_lane["forkedFrom"]);
    assert_eq!(lane["components"], node_lane["components"]);
    let native_status = helper.native_run("status --json");
    let node_status =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(parse(&native_status.stdout), parse(&node_status.stdout));
}

#[test]
fn bare_lane_and_component_issues_and_remove_comp_and_remove_readme_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let node_root = helper.clone_workspace();
    for cmd in [
        "component-issues",
        "component-issues --json",
        "lane",
        "lane -d",
        "lane --merged",
        "lane --not-merged",
    ] {
        let node = Helper::cmd_in_with(&node_root, cmd, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(cmd);
        assert!(native.native, "{cmd}: {}", native.trace);
        assert_eq!(native.status.code(), node.status.code(), "{cmd}");
        if cmd.ends_with("--json") {
            assert_eq!(parse(&native.stdout), parse(&node.stdout), "{cmd}");
        } else {
            assert_eq!(native.stdout, node.stdout, "{cmd}");
        }
        assert_eq!(native.stderr, node.stderr, "{cmd}");
    }

    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");

    let node_root2 = helper.clone_workspace();
    let cmd_rc = "lane remove-comp bar/foo --workspace-only";
    let node_rc = Helper::cmd_in_with(&node_root2, cmd_rc, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_rc = helper.native_run(cmd_rc);
    assert!(native_rc.native, "{}", native_rc.trace);
    assert_eq!(native_rc.status.code(), node_rc.status.code());
    assert_eq!(native_rc.stdout, node_rc.stdout);
    assert_eq!(native_rc.stderr, node_rc.stderr);

    let node_root3 = helper.clone_workspace();
    let cmd_rr = "lane remove-readme";
    let node_rr = Helper::cmd_in_with(&node_root3, cmd_rr, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native_rr = helper.native_run(cmd_rr);
    assert!(native_rr.native, "{}", native_rr.trace);
    assert_eq!(native_rr.status.code(), node_rr.status.code());
    assert_eq!(native_rr.stdout, node_rr.stdout);
    assert_eq!(native_rr.stderr, node_rr.stderr);
}
