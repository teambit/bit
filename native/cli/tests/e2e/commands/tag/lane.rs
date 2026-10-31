//! Released lane tagging supports a pending soft tag, while persisting a `SemVer` tag is rejected.

use super::soft::bitmap;
use crate::helper::{FOO_FIXTURE, Helper};
use sha1::{Digest, Sha1};
use std::{ffi::OsStr, fs};

#[test]
fn soft_tag_populates_missing_lane_history_once_with_released_full_state() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("link");
    helper.native("lane create dev");
    helper.native("snap bar/foo --message seed");
    helper.append_file("bar/foo.js", "\n// changed on lane");
    let hash = format!("{:x}", Sha1::digest(b"my-scope/bar/foo:VersionHistory"));
    let history = helper.scopes.local_path
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    assert!(!history.exists(), "fixture must start without populated history");
    crate::commands::add::support::compare(&helper, "tag --soft bar/foo --message planned");
    assert!(history.is_file(), "soft-tag status must populate the lane's snap history");
    crate::commands::add::support::compare(&helper, "tag --soft bar/foo --minor --message revised");
}

#[test]
fn soft_tag_on_lane_keeps_lane_graph_and_matches_released_bitmap() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("link");
    helper.native("lane create dev");
    helper.native("snap bar/foo --message seed");
    helper.append_file("bar/foo.js", "\n// changed on lane");
    let node_root = helper.clone_workspace();
    let before_index = fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap();
    let command = "tag --soft bar/foo --message planned";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(bitmap(&helper.scopes.local_path), bitmap(&node_root));
    assert_eq!(fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(), before_index);
    assert_eq!(bitmap(&helper.scopes.local_path)["_bit_lane"], bitmap(&node_root)["_bit_lane"]);
    let command = "tag --persist=skip-build";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.cmd(command);
    assert!(!native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(bitmap(&helper.scopes.local_path), bitmap(&node_root));
}

#[test]
fn ordinary_lane_tag_delegates_to_released_rejection_without_native_graph_writes() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("link");
    helper.native("lane create dev");
    helper.native("snap bar/foo --message seed");
    helper.append_file("bar/foo.js", "\n// changed on lane");
    let before = fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap();
    let run = helper.cmd("tag bar/foo --message blocked");
    assert!(!run.native, "{}", run.trace);
    assert!(!run.status.success());
    assert!(run.stderr.contains("unable to tag when checked out to a lane"));
    assert_eq!(fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(), before);
}
