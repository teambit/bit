//! The released scope cascade ([`compare`], [`hidden_head`]) predates identity matching for older snapshots.
//! Compares carried metadata with its fast-forward result, then asserts every upstream cascade change.
//! Verifies hidden dependent version parent, log message, and lane origin updates across scopes.
use crate::helper::{Helper, parse};
use serde_json::{Value, json};
use std::path::Path;

/// Asserts that the cascaded hidden `comp1` `Version` in `helper` matches `oracle` updated for `visible_head`.
pub(super) fn compare(helper: &Helper, oracle: &Path, visible_head: &str) {
    let id = format!("{}/comp1", helper.scopes.remote);
    let current_lane = parse(&helper.native("cat-lane hidden-policy"));
    let incoming = parse(&Helper::cmd_in(oracle, "cat-lane hidden-policy").stdout);
    let old_head = hidden_head(&incoming);
    let new_head = hidden_head(&current_lane);
    assert_ne!(new_head, old_head);
    let actual = super::super::cascade::version(&helper.scopes.local_path, &id);
    let mut expected = super::super::cascade::version(oracle, &id);
    let dependency = expected["dependencies"][0]["id"]["version"].as_str().unwrap();
    expected = parse(
        &expected
            .to_string()
            .replace(dependency, visible_head)
            .replace(old_head, new_head),
    );
    expected["parents"] = json!([old_head]);
    expected["log"]["message"] = json!("merged (bump dependencies versions)");
    expected["origin"]["lane"] = json!({
        "scope":current_lane["scope"],"name":current_lane["name"],"hash":current_lane["hash"],
    });
    expected
        .as_object_mut()
        .unwrap()
        .remove("dependenciesGraphRef");
    let builder = expected["extensions"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|entry| entry["name"] == "teambit.pipelines/builder")
        .unwrap();
    builder["data"] = json!({});
    assert_eq!(actual, expected);
}

/// Extracts the version hash from the first `updateDependents` entry in `lane` ([`compare`], [`Value`], [`Helper`], [`Path`], [`parse`]).
fn hidden_head(lane: &Value) -> &str {
    lane["updateDependents"][0]
        .as_str()
        .unwrap()
        .rsplit_once('@')
        .unwrap()
        .1
}
