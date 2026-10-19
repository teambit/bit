//! Hidden members are seeded through the released bare-scope snap API.
use super::fixture;
use crate::{
    commands::move_paths::support,
    helper::{Helper, remote},
};
use serde_json::Value;
use std::fs;

fn seeded() -> Helper {
    let helper = fixture::workspace(3, false);
    helper.output_file("comp1/index.js", "module.exports=require('../comp2');\n");
    helper.output_file("comp2/index.js", "module.exports=require('../comp3');\n");
    support::setup(&helper, "link --rewire");
    support::tag(&helper);
    remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "comp3 --skip-auto-snap --unmodified");
    remote::publish(&helper);
    helper.seed_hidden_update_dependent(
        &format!("{}/comp2", helper.scopes.remote),
        &format!("{}/dev", helper.scopes.remote),
    );
    helper.re_init_workspace();
    helper.add_remote_scope();
    support::setup(&helper, &format!("lane import {}/dev -x", helper.scopes.remote));
    support::setup(&helper, &format!("import {}/comp3 -x", helper.scopes.remote));
    helper
}

fn hidden(lane: &Value) -> String {
    let rows = lane["updateDependents"].as_array().expect("real hidden members");
    assert_eq!(rows.len(), 1);
    rows[0].as_str().unwrap().to_owned()
}

#[test]
fn all_reset_rewinds_the_real_hidden_cascade_without_adding_bitmap_rows() {
    let helper = seeded();
    let before = support::json(&helper, "cat-lane dev");
    let hidden_before = hidden(&before);
    let bitmap = support::bitmap(&helper);
    let entries = bitmap
        .as_object()
        .unwrap()
        .values()
        .filter(|row| row.get("rootDir").is_some())
        .collect::<Vec<_>>();
    assert_eq!(entries.len(), 1);
    let root = entries[0]["rootDir"].as_str().unwrap();
    let path = helper.scopes.local_path.join(root).join("index.js");
    fs::write(&path, "module.exports=()=> 'comp3-local-cascade';\n").unwrap();
    fixture::snap(&helper, "");
    assert_ne!(hidden(&support::json(&helper, "cat-lane dev")), hidden_before);
    let bytes = fs::read(&path).unwrap();
    fixture::successful(&helper, "reset --silent");
    assert_eq!(support::json(&helper, "cat-lane dev")["components"], before["components"]);
    assert_eq!(hidden(&support::json(&helper, "cat-lane dev")), hidden_before);
    assert_eq!(support::bitmap(&helper), bitmap);
    assert_eq!(fs::read(path).unwrap(), bytes);
    fixture::modified_only(&helper, 1);
}
