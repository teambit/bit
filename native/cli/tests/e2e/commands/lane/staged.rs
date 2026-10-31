//! Released-oracle comparison for transferring main snaps to a new lane.
use super::{object, state};
use crate::{
    commands::move_paths::support::setup,
    helper::{Helper, config, parse},
};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{ffi::OsStr, fs, path::Path};

#[test]
fn staged_main_snaps_move_to_the_new_lane_with_and_without_a_remote_head() {
    for exported in [false, true] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("alpha/index.js", "module.exports = 'first';\n");
        setup(&helper, "add alpha -i alpha");
        setup(&helper, "snap -m first");
        let first =
            config::read_jsonc(&helper.scopes.local_path.join(".bitmap"))["alpha"]["version"]
                .as_str()
                .unwrap()
                .to_owned();
        if exported {
            setup(&helper, "export");
        }
        helper.output_file("alpha/index.js", "module.exports = 'second';\n");
        setup(&helper, "snap -m second");
        let second =
            config::read_jsonc(&helper.scopes.local_path.join(".bitmap"))["alpha"]["version"]
                .as_str()
                .unwrap()
                .to_owned();
        let oracle = helper.clone_workspace();
        let remote = state(&helper.scopes.remote_path);
        let node =
            Helper::cmd_in_with(&oracle, "lane create dev", &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run("lane create dev");
        assert!(native.native, "{}", native.trace);
        assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        compare(&helper.scopes.local_path, &oracle, &[first, second]);
        assert_eq!(state(&helper.scopes.remote_path), remote);
    }
}

fn compare(native: &Path, oracle: &Path, versions: &[String]) {
    for path in [".bitmap", ".bit/scope.json"] {
        assert_eq!(
            config::read_jsonc(&native.join(path)),
            config::read_jsonc(&oracle.join(path)),
            "{path}",
        );
    }
    let actual = config::read_jsonc(&native.join(".bit/index.json"));
    let expected = config::read_jsonc(&oracle.join(".bit/index.json"));
    let actual_hash = actual["lanes"][0]["hash"].as_str().unwrap();
    let expected_hash = expected["lanes"][0]["hash"].as_str().unwrap();
    assert_eq!(actual["components"], expected["components"]);
    assert_eq!(actual["lanes"][0]["id"], expected["lanes"][0]["id"]);
    for row in actual["components"].as_array().unwrap() {
        let hash = row["hash"].as_str().unwrap();
        assert_eq!(object(native, hash, "Component"), object(oracle, hash, "Component"));
    }
    for hash in versions {
        assert_eq!(
            normalize(object(native, hash, "Version"), actual_hash),
            normalize(object(oracle, hash, "Version"), expected_hash),
        );
    }
    assert_eq!(
        normalize(object(native, actual_hash, "Lane"), actual_hash),
        normalize(object(oracle, expected_hash, "Lane"), expected_hash),
    );
    assert_eq!(history(native, actual_hash), history(oracle, expected_hash));
    assert_eq!(objects(native, actual_hash), objects(oracle, expected_hash));
    assert_eq!(
        fs::read(native.join("alpha/index.js")).unwrap(),
        fs::read(oracle.join("alpha/index.js")).unwrap(),
    );
}

fn history(root: &Path, hash: &str) -> Value {
    let history_hash = format!("{:x}", Sha1::digest(format!("{hash}:LaneHistory").as_bytes()));
    let mut value = normalize(object(root, &history_hash, "LaneHistory"), hash);
    let entries = value["history"].as_object().unwrap();
    assert_eq!(entries.len(), 1);
    let mut entry = entries.values().next().unwrap().clone();
    entry["log"]["date"] = json!("TIME");
    value["history"] = json!({"HISTORY_ID":entry});
    value
}

fn normalize(mut value: Value, hash: &str) -> Value {
    if value.get("components").is_some() && value["log"].is_object() {
        value["log"]["date"] = json!("TIME");
    }
    parse(&serde_json::to_string(&value).unwrap().replace(hash, "LANE_HASH"))
}

fn objects(root: &Path, lane_hash: &str) -> std::collections::BTreeMap<String, Value> {
    let history_hash = format!("{:x}", Sha1::digest(format!("{lane_hash}:LaneHistory").as_bytes()));
    state(root)
        .into_iter()
        .filter_map(|(path, bytes)| {
            let relative = path.strip_prefix(".bit/objects/")?;
            if relative.len() != 41 || relative.as_bytes()[2] != b'/' {
                return None;
            }
            let hash = relative.replace('/', "");
            let end = bytes
                .iter()
                .position(|byte| *byte == 0)
                .unwrap();
            let header = std::str::from_utf8(&bytes[..end]).unwrap();
            let kind = header.split(' ').next().unwrap();
            let value = if kind == "Source" {
                json!(&bytes[end + 1..])
            } else if kind == "LaneHistory" && hash == history_hash {
                history(root, lane_hash)
            } else {
                normalize(serde_json::from_slice(&bytes[end + 1..]).unwrap(), lane_hash)
            };
            let key = hash.replace(lane_hash, "LANE_HASH").replace(&history_hash, "HISTORY_HASH");
            Some((key, json!({"kind":kind,"value":value})))
        })
        .collect()
}
