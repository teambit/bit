//! Client-side lane creation from a clean main workspace.
use crate::helper::{Helper, config, parse, setup};
use flate2::read::ZlibDecoder;
use sha1::{Digest, Sha1};
use std::{
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
    helper.run("tag bar/foo --message base");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("export");
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
    helper.run("tag bar/foo --message base");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("export");
    let producer = helper.clone_workspace();
    helper.run("switch main -x");
    helper.run("lane create other");
    fs::write(producer.join("bar/foo.js"), "module.exports = () => 'advanced';").unwrap();
    for command in ["snap bar/foo --message advance", "export"] {
        let result = Helper::cmd_in_with(&producer, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(result.status.success(), "{command}: {} {}", result.stdout, result.stderr);
    }
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
fn http_remote_lane_inspection_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = () => 'foo';");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("export");
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
        assert!(node.status.success());
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
    helper.run("tag bar/foo --message base");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("export");
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
    helper.run("switch main -x");
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
    helper.run("export");
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
    helper.run("tag");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap comp2 --skip-auto-snap --unmodified --message lane");
    helper.run("export");
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
    helper.run("tag bar/foo --message base");
    helper.run("export");
    helper.run("lane create dev");
    assert_lane_filters_match_node(&helper);
    helper.run("snap --unmodified --message lane");
    if let Some(destination) = std::env::var_os("BIT_NATIVE_LANE_LIST_BENCH_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        setup::copy_dir(&helper.scopes.local_path, &destination);
    }
    assert_lane_filters_match_node(&helper);
    helper.run("switch main");
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
    helper.run("lane create dev");
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
fn local_alias_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.run("lane create dev");
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
    helper.run("lane create dev");
    if with_component {
        helper.create_component_bar_foo("// lane component");
        helper.add_component_bar_foo();
        helper.run("snap --message on-lane");
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
    helper.run("tag bar/foo --message base");
    helper.run("export");
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
    helper.run("lane create parent");
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
    helper.run("lane create parent");
    helper.create_component_bar_foo("// on parent");
    helper.add_component_bar_foo();
    helper.run("snap --message parent");
    helper.run("export");
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
    helper.run("lane create parent");
    helper.create_component_bar_foo("// on parent");
    helper.add_component_bar_foo();
    helper.run("snap --message parent");
    helper.run("export");
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
