//! Released Node hard-delete state and output are compared on independent remote copies.

use super::Helper;
use crate::{commands::move_paths::support::tree, helper::config};
use std::{
    ffi::OsStr,
    fs,
    io::{self, Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::{Duration, Instant},
};

fn compare_file_remote(helper: &Helper, command: &str) {
    let baseline = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let feature = ("BIT_FEATURES", OsStr::new("hard-delete"));
    let node =
        Helper::cmd_in_with(&node_root, command, &[feature, ("BIT_NATIVE", OsStr::new("off"))]);
    let node_objects = tree(&helper.scopes.remote_path);
    let node_index = fs::read(helper.scopes.remote_path.join("index.json")).unwrap();
    helper.restore_remote_scope(&baseline);
    let native = Helper::cmd_in_with(&helper.scopes.local_path, command, &[feature]);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(removal_order(&native.stdout), removal_order(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(tree(&helper.scopes.remote_path), node_objects);
    assert_eq!(fs::read(helper.scopes.remote_path.join("index.json")).unwrap(), node_index);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
}

// Published Scope.filterFoundAndMissingComponents pushes IDs from concurrent loads.
// Validate and order only its success-item suffix; retain every other output byte.
fn removal_order(output: &str) -> String {
    let Some((prefix, items)) =
        output.split_once("✔ successfully removed components from the remote scope\n")
    else {
        return output.to_owned();
    };
    let mut rows = items.lines().collect::<Vec<_>>();
    for row in &rows {
        let id = row.strip_prefix("   › ").unwrap();
        assert!(
            id.split_once('/')
                .is_some_and(|(scope, name)| {
                    !scope.is_empty() && !name.is_empty() && !id.chars().any(char::is_whitespace)
                }),
        );
    }
    let count = rows.len();
    rows.sort_unstable();
    rows.dedup();
    assert_eq!(rows.len(), count);
    format!(
        "{prefix}✔ successfully removed components from the remote scope\n{}\n",
        rows.join("\n"),
    )
}

#[test]
fn exported_component_hard_delete_matches_released_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'published';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    let command = format!("delete {}/bar/foo --hard --silent", helper.scopes.remote);
    compare_file_remote(&helper, &command);
}

fn historical_dependency_fixture() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "--ignore-issues *");
    crate::helper::remote::publish(&helper);
    helper.output_file("comp1/index.js", "module.exports = () => 'independent';");
    helper.tag_without_build("comp1", "");
    crate::helper::remote::publish(&helper);
    helper
}

#[test]
fn historical_version_dependent_blocks_hard_delete_like_node() {
    let helper = historical_dependency_fixture();
    let command = format!("delete {}/comp2 --hard --silent", helper.scopes.remote);
    compare_file_remote(&helper, &command);
}

#[test]
fn forcing_historical_version_dependent_removes_only_model_refs_like_node() {
    let helper = historical_dependency_fixture();
    let command = format!("delete {}/comp2 --hard --silent --force", helper.scopes.remote);
    compare_file_remote(&helper, &command);
}

#[test]
fn wildcard_hard_delete_selects_all_remote_components_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "--ignore-issues *");
    crate::helper::remote::publish(&helper);
    let command = format!("delete {}/comp* --hard --silent --force", helper.scopes.remote);
    compare_file_remote(&helper, &command);
}

#[test]
fn remote_lane_force_remove_trashes_lane_like_node() {
    let helper = Helper::new();
    super::exported_lane_setup(&helper, false);
    let before: serde_json::Value =
        serde_json::from_slice(&fs::read(helper.scopes.remote_path.join("index.json")).unwrap())
            .unwrap();
    let lane_hash = before["lanes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"]["name"] == "dev")
        .unwrap()["hash"]
        .as_str()
        .unwrap()
        .to_owned();
    let command = format!("lane remove {}/dev --remote --silent --force", helper.scopes.remote);
    let baseline = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let node_index = fs::read(helper.scopes.remote_path.join("index.json")).unwrap();
    let trash = format!("trash/{}/{}", &lane_hash[..2], &lane_hash[2..]);
    let node_trash = fs::read(helper.scopes.remote_path.join(&trash)).unwrap();
    helper.restore_remote_scope(&baseline);
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(fs::read(helper.scopes.remote_path.join("index.json")).unwrap(), node_index);
    assert_eq!(fs::read(helper.scopes.remote_path.join(trash)).unwrap(), node_trash);
}

#[test]
fn remote_merged_lane_removal_matches_node_without_force() {
    let helper = Helper::new();
    super::exported_lane_setup(&helper, false);
    helper.run("switch main -x");
    helper.run("lane merge dev -x");
    crate::helper::remote::publish(&helper);
    let command = format!("lane remove {}/dev --remote --silent", helper.scopes.remote);
    compare_file_remote(&helper, &command);
}

#[test]
fn remote_lanes_in_two_file_scopes_are_both_removed_like_node() {
    let first = Helper::new();
    let second = Helper::new();
    super::exported_lane_setup(&first, false);
    super::exported_lane_setup(&second, false);
    config::update_scope_json(&first.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"][&second.scopes.remote] =
            serde_json::json!(format!("file://{}", second.scopes.remote_path.display()));
    });
    let before_first = first.clone_remote_scope();
    let before_second = second.clone_remote_scope();
    let node_root = first.clone_workspace();
    let command = format!(
        "lane remove {}/dev {}/dev --remote --silent --force",
        first.scopes.remote, second.scopes.remote,
    );
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let node_first = fs::read(first.scopes.remote_path.join("index.json")).unwrap();
    let node_second = fs::read(second.scopes.remote_path.join("index.json")).unwrap();
    first.restore_remote_scope(&before_first);
    second.restore_remote_scope(&before_second);
    let native = first.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(fs::read(first.scopes.remote_path.join("index.json")).unwrap(), node_first);
    assert_eq!(fs::read(second.scopes.remote_path.join("index.json")).unwrap(), node_second);
    assert!(native.status.success());
}

fn accept_until(listener: &TcpListener, deadline: Instant) -> TcpStream {
    loop {
        match listener.accept() {
            Ok((socket, _)) => return socket,
            Err(error)
                if error.kind() == io::ErrorKind::WouldBlock && Instant::now() < deadline =>
            {
                thread::sleep(Duration::from_millis(10));
            }
            Err(error) => panic!("delete request did not arrive: {error}"),
        }
    }
}

#[test]
fn second_remote_failure_does_not_replay_the_acknowledged_file_lane_delete() {
    let helper = Helper::new();
    super::exported_lane_setup(&helper, false);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    listener.set_nonblocking(true).unwrap();
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"]["failing.scope"] = serde_json::json!(endpoint);
    });
    let server = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_mins(1);
        for _ in 0..2 {
            let mut socket = accept_until(&listener, deadline);
            socket.set_nonblocking(false).unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(10)))
                .unwrap();
            let mut bytes = [0_u8; 16384];
            let size = socket.read(&mut bytes).unwrap();
            assert!(
                std::str::from_utf8(&bytes[..size]).unwrap().contains("POST /api/scope/delete"),
            );
            thread::sleep(Duration::from_millis(800));
            socket.write_all(b"HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: 33\r\nConnection: close\r\n\r\n{\"message\":\"synthetic rejection\"}").unwrap();
        }
    });
    let before = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    let command = format!(
        "lane remove {}/dev failing.scope/dev --remote --silent --force",
        helper.scopes.remote,
    );
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let node_index = fs::read(helper.scopes.remote_path.join("index.json")).unwrap();
    helper.restore_remote_scope(&before);
    let native = helper.native_run(&command);
    server.join().unwrap();
    assert!(native.native, "{}", native.trace);
    assert!(!node.status.success());
    assert!(!native.status.success());
    assert_eq!(fs::read(helper.scopes.remote_path.join("index.json")).unwrap(), node_index);
    let index: serde_json::Value = serde_json::from_slice(&node_index).unwrap();
    assert!(
        index["lanes"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

#[test]
fn hard_delete_guard_preserves_the_remote_and_delegates_to_released_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'published';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(&helper);
    let before = tree(&helper.scopes.remote_path);
    let command = format!("delete {}/bar/foo --hard --silent", helper.scopes.remote);
    let result = helper.cmd(&command);
    assert!(!result.native, "guard must run on the released CLI");
    assert!(!result.status.success());
    assert!(result.stderr.contains("interactive confirmation"));
    assert_eq!(tree(&helper.scopes.remote_path), before);
}
