//! Only the local `LaneHistory` is stale; component Versions and `VersionHistory` stay consistent.
use super::fixture;
use crate::{commands::move_paths::support, helper::remote};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{fs, io::Write};

#[test]
fn checkout_refreshes_remote_lane_history_before_resolving_the_requested_entry() {
    let fixture = fixture::initial();
    fixture.helper.output_file("comp3/index.js", "module.exports='remote-history';\n");
    support::setup(&fixture.helper, "snap --ignore-issues * --message remote-update");
    remote::publish(&fixture.helper);
    let history = fixture::latest(&fixture.helper);
    assert_ne!(history, fixture.history);
    fixture.helper.output_file("comp3/index.js", "module.exports='newest-history';\n");
    support::setup(&fixture.helper, "snap --ignore-issues * --message newest");
    remote::publish(&fixture.helper);
    // Populate the released component history before constructing the stale-LaneHistory input.
    support::setup(
        &fixture.helper,
        &format!("import {}/comp3 --all-history -x", fixture.helper.scopes.remote),
    );
    remove_local_entry(&fixture.helper, &history);
    let fixture = fixture::Fixture { history, ..fixture };
    fixture::successful(&fixture, "checkout", false, false);
    assert_eq!(
        fs::read_to_string(fixture.helper.scopes.local_path.join("comp3/index.js")).unwrap(),
        fixture::written_source("module.exports='remote-history';\n"),
    );
}

fn remove_local_entry(helper: &crate::helper::Helper, id: &str) {
    let lane = lane_hash(helper);
    let mut value =
        bit_object_import::lane_history::read(&helper.scopes.local_path, &lane).unwrap();
    assert!(
        value["history"]
            .as_object_mut()
            .unwrap()
            .remove(id)
            .is_some(),
    );
    let hash = format!("{:x}", Sha1::digest(format!("{lane}:LaneHistory").as_bytes()));
    let path = bit_object_import::scope_path(&helper.scopes.local_path)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::write(path, encode(&hash, &value)).unwrap();
    assert!(
        bit_object_import::lane_history::read(&helper.scopes.local_path, &lane).unwrap()["history"]
            .get(id)
            .is_none(),
    );
}

fn lane_hash(helper: &crate::helper::Helper) -> String {
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let index: Value =
        serde_json::from_slice(&fs::read(scope.join("index.json")).unwrap()).unwrap();
    index["lanes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"]["name"] == "dev")
        .unwrap()["hash"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn encode(hash: &str, value: &Value) -> Vec<u8> {
    let body = serde_json::to_vec(value).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(format!("LaneHistory {hash} {}\0", body.len()).as_bytes())
        .unwrap();
    encoder.write_all(&body).unwrap();
    encoder.finish().unwrap()
}
