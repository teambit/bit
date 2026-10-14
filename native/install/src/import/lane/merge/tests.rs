use super::merge_and_save;
use crate::import::{
    bitmap::LaneId,
    lane::{RemoteLane, history::Identity},
    objects::{IndexRow, Repo, component_hash, compress_json, sha1_hex, version_history_hash},
};
use serde_json::{Value, json};
use tempfile::TempDir;

const SCOPE: &str = "org";
const LANE: &str = "dev";

fn write(repo: &Repo, kind: &str, hash: &str, value: &Value) {
    repo.write_raw(hash, &compress_json(kind, hash, value).unwrap())
        .unwrap();
}

/// A component `org/<name>` whose snaps are `(hash, parents)`; the head is the last one.
fn component(repo: &Repo, name: &str, snaps: &[(&str, &[&str])]) {
    let versions: Vec<Value> = snaps
        .iter()
        .map(|(hash, parents)| {
            write(repo, "Version", hash, &json!({ "parents": parents, "log": {} }));
            json!({ "hash": hash, "parents": parents })
        })
        .collect();
    let head = snaps
        .last()
        .map(|(hash, _)| *hash)
        .unwrap_or_default();
    write(
        repo,
        "Component",
        &component_hash(SCOPE, name),
        &json!({ "name": name, "scope": SCOPE, "versions": {}, "head": head }),
    );
    write(
        repo,
        "VersionHistory",
        &version_history_hash(SCOPE, name),
        &json!({ "name": name, "scope": SCOPE, "versions": versions }),
    );
}

fn lane_object(name: &str, components: &[(&str, &str)], hidden: &[&str]) -> Value {
    let components: Vec<Value> = components
        .iter()
        .map(|(component, head)| json!({ "id": { "scope": SCOPE, "name": component }, "head": head }))
        .collect();
    let mut object = json!({
        "name": name,
        "scope": SCOPE,
        "components": components,
        "log": { "date": "1700000000000" },
        "schema": "1.0.0",
    });
    if !hidden.is_empty() {
        object["updateDependents"] = json!(hidden);
    }
    object
}

fn local_lane(repo: &Repo, hash: &str, object: &Value) {
    write(repo, "Lane", hash, object);
    repo.index_add(&[IndexRow::Lane {
        scope: SCOPE.into(),
        name: object["name"].as_str().unwrap().into(),
        hash: hash.into(),
    }])
    .unwrap();
}

fn remote_lane(hash: &str, object: Value) -> RemoteLane {
    RemoteLane {
        id: LaneId { scope: SCOPE.into(), name: LANE.into(), exported: true },
        hash: hash.into(),
        compressed: compress_json("Lane", hash, &object).unwrap(),
        object,
    }
}

fn snap(seed: &str) -> String {
    sha1_hex(seed)
}

fn lane_hash() -> String {
    sha1_hex("lane")
}

fn history(repo: &Repo, hash: &str) -> Option<Value> {
    repo.read_json(&super::super::history::history_hash(hash))
        .unwrap()
}

#[test]
fn fast_forwards_a_local_entry_the_remote_moved_ahead() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let (first, second) = (snap("a"), snap("b"));
    component(&repo, "comp", &[(&first, &[]), (&second, &[&first])]);
    local_lane(&repo, &lane_hash(), &lane_object(LANE, &[("comp", &first)], &[]));
    let remote = remote_lane(&lane_hash(), lane_object(LANE, &[("comp", &second)], &[]));
    let identity = Identity { username: Some("me".into()), email: None };
    merge_and_save(&repo, &remote, &identity).unwrap();
    let saved = repo
        .read_json(&lane_hash())
        .unwrap()
        .unwrap();
    assert_eq!(saved["components"][0]["head"], json!(second));
    let keys: Vec<&String> = saved
        .as_object()
        .unwrap()
        .keys()
        .collect();
    assert_eq!(keys, ["name", "scope", "components", "log", "schema"]);
    assert!(
        history(&repo, &lane_hash()).is_none(),
        "the merged lane equals the remote one, so saveLane skips the history",
    );
}

#[test]
fn records_history_when_the_merged_lane_differs_from_the_remote() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let (first, second) = (snap("a"), snap("b"));
    component(&repo, "moved", &[(&first, &[]), (&second, &[&first])]);
    let (base, local, remote_head) = (snap("base"), snap("local"), snap("remote"));
    component(&repo, "diverged", &[(&base, &[]), (&local, &[&base]), (&remote_head, &[&base])]);
    let local_entries = [("moved", first.as_str()), ("diverged", local.as_str())];
    local_lane(&repo, &lane_hash(), &lane_object(LANE, &local_entries, &[]));
    let remote_entries = [("moved", second.as_str()), ("diverged", remote_head.as_str())];
    let remote = remote_lane(&lane_hash(), lane_object(LANE, &remote_entries, &[]));
    let identity = Identity { username: Some("me".into()), email: None };
    merge_and_save(&repo, &remote, &identity).unwrap();
    let saved = repo
        .read_json(&lane_hash())
        .unwrap()
        .unwrap();
    assert_eq!(saved["components"][0]["head"], json!(second));
    assert_eq!(saved["components"][1]["head"], json!(local));
    let history = history(&repo, &lane_hash()).expect("a history entry for the change");
    assert_eq!(history["laneHash"], json!(lane_hash()));
    let (key, entry) = history["history"]
        .as_object()
        .unwrap()
        .iter()
        .next()
        .unwrap();
    assert_eq!(key.len(), 36, "uuid v4 key");
    assert_eq!(entry["log"]["username"], "me");
    assert_eq!(entry["log"]["message"], "import (merge from remote)");
    assert_eq!(
        entry["components"],
        json!([format!("{SCOPE}/moved@{second}"), format!("{SCOPE}/diverged@{local}")]),
    );
    assert_eq!(entry["updateDependents"], json!([]));
}

#[test]
fn keeps_a_diverged_local_entry_and_writes_nothing() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let (base, local, remote_head) = (snap("a"), snap("local"), snap("remote"));
    component(&repo, "comp", &[(&base, &[]), (&local, &[&base]), (&remote_head, &[&base])]);
    local_lane(&repo, &lane_hash(), &lane_object(LANE, &[("comp", &local)], &[]));
    let remote = remote_lane(&lane_hash(), lane_object(LANE, &[("comp", &remote_head)], &[]));
    merge_and_save(&repo, &remote, &Identity::default()).unwrap();
    let saved = repo
        .read_json(&lane_hash())
        .unwrap()
        .unwrap();
    assert_eq!(saved["components"][0]["head"], json!(local));
    assert!(history(&repo, &lane_hash()).is_none());
}

#[test]
fn a_local_entry_ahead_of_the_remote_stays() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let (first, second) = (snap("a"), snap("b"));
    component(&repo, "comp", &[(&first, &[]), (&second, &[&first])]);
    local_lane(&repo, &lane_hash(), &lane_object(LANE, &[("comp", &second)], &[]));
    let remote = remote_lane(&lane_hash(), lane_object(LANE, &[("comp", &first)], &[]));
    merge_and_save(&repo, &remote, &Identity::default()).unwrap();
    let saved = repo
        .read_json(&lane_hash())
        .unwrap()
        .unwrap();
    assert_eq!(saved["components"][0]["head"], json!(second));
}

#[test]
fn rejects_a_lane_with_the_same_id_but_another_hash() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    local_lane(&repo, &lane_hash(), &lane_object(LANE, &[], &[]));
    let remote = remote_lane(&sha1_hex("other"), lane_object(LANE, &[], &[]));
    let error = merge_and_save(&repo, &remote, &Identity::default()).unwrap_err();
    assert!(
        error
            .to_string()
            .starts_with(r#"unable to merge "org/dev" lane. a lane with the same id already exists with a different hash."#),
        "{error}",
    );
}

#[test]
fn a_remote_lane_the_scope_lacks_is_not_written() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let first = snap("a");
    component(&repo, "comp", &[(&first, &[])]);
    let remote = remote_lane(&lane_hash(), lane_object(LANE, &[("comp", &first)], &[]));
    merge_and_save(&repo, &remote, &Identity::default()).unwrap();
    assert!(!repo.exists(&lane_hash()), "Lane.parse leaves hasChanged off, so saveLane skips it");
    assert!(
        repo.lane_hash(SCOPE, LANE)
            .unwrap()
            .is_none(),
    );
}

#[test]
fn hidden_entries_follow_the_origin() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let (first, second) = (snap("a"), snap("b"));
    component(&repo, "kept", &[(&first, &[]), (&second, &[&first])]);
    component(&repo, "dropped", &[(&first, &[])]);
    component(&repo, "added", &[(&first, &[])]);
    let hidden = [format!("{SCOPE}/kept@{first}"), format!("{SCOPE}/dropped@{first}")];
    let hidden: Vec<&str> = hidden
        .iter()
        .map(String::as_str)
        .collect();
    local_lane(&repo, &lane_hash(), &lane_object(LANE, &[], &hidden));
    let incoming = [format!("{SCOPE}/kept@{second}"), format!("{SCOPE}/added@{first}")];
    let incoming: Vec<&str> = incoming
        .iter()
        .map(String::as_str)
        .collect();
    let remote = remote_lane(&lane_hash(), lane_object(LANE, &[], &incoming));
    merge_and_save(&repo, &remote, &Identity::default()).unwrap();
    let saved = repo
        .read_json(&lane_hash())
        .unwrap()
        .unwrap();
    assert_eq!(
        saved["updateDependents"],
        json!([format!("{SCOPE}/kept@{second}"), format!("{SCOPE}/added@{first}")]),
    );
    assert!(history(&repo, &lane_hash()).is_none(), "visible entries are unchanged");
}

#[test]
fn a_renamed_lane_takes_the_incoming_id() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let first = snap("a");
    component(&repo, "comp", &[(&first, &[])]);
    local_lane(&repo, &lane_hash(), &lane_object("old-name", &[("comp", &first)], &[]));
    let remote = remote_lane(&lane_hash(), lane_object(LANE, &[("comp", &first)], &[]));
    merge_and_save(&repo, &remote, &Identity::default()).unwrap();
    let saved = repo
        .read_json(&lane_hash())
        .unwrap()
        .unwrap();
    assert_eq!(saved["name"], LANE);
    assert_eq!(repo.lane_hash(SCOPE, LANE).unwrap(), Some(lane_hash()));
    assert!(
        repo.lane_hash(SCOPE, "old-name")
            .unwrap()
            .is_none(),
    );
}

#[test]
fn a_missing_component_fails_the_merge() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    local_lane(&repo, &lane_hash(), &lane_object(LANE, &[], &[]));
    let remote = remote_lane(&lane_hash(), lane_object(LANE, &[("ghost", &snap("a"))], &[]));
    let error = merge_and_save(&repo, &remote, &Identity::default()).unwrap_err();
    assert_eq!(
        error.to_string(),
        "unable to merge lane dev, the component org/ghost was not found",
    );
}
