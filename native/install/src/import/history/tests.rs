use super::{Completeness, check, incomplete};
use crate::{
    import::{
        bitmap::Id,
        fetch::Fetcher,
        http::Network,
        objects::{RemoteRef, Repo, component_hash, compress_json, sha1_hex, version_history_hash},
        plan::Importer,
        remotes::Remotes,
    },
    model::GlobalConfig,
};
use serde_json::{Value, json};
use std::{fs, path::Path};
use tempfile::TempDir;

fn write(repo: &Repo, kind: &str, hash: &str, value: &Value) {
    repo.write_raw(hash, &compress_json(kind, hash, value).unwrap())
        .unwrap();
}

fn history(versions: &Value, complete: &[&str]) -> Value {
    json!({ "name": "comp1", "scope": "remote", "versions": versions, "graphCompleteRefs": complete })
}

#[test]
fn a_history_with_every_ancestor_is_complete() {
    let versions = json!([
        { "hash": "b", "parents": ["a"] },
        { "hash": "a", "parents": [] },
    ]);
    assert_eq!(check(&history(&versions, &[]), "b"), Completeness::Complete);
    assert_eq!(check(&history(&versions, &["b"]), "b"), Completeness::Recorded);
}

#[test]
fn a_missing_ancestor_or_version_is_incomplete() {
    let versions = json!([
        { "hash": "c", "parents": ["b", "a"] },
        { "hash": "b", "parents": ["x"] },
        { "hash": "a", "parents": [] },
    ]);
    assert_eq!(check(&history(&versions, &[]), "c"), Completeness::Incomplete);
    assert_eq!(check(&history(&versions, &[]), "a"), Completeness::Complete);
    assert_eq!(check(&history(&versions, &[]), "zz"), Completeness::Incomplete);
}

/// `remote/comp1` with `0.0.1` = `first` and `0.0.2` = `second` (child of `first`);
/// `history_versions` decides what the stored `VersionHistory` knows.
fn store(repo: &Repo, history_versions: &Value) -> (String, String) {
    let first = sha1_hex("first");
    let second = sha1_hex("second");
    for (hash, parents) in [(&first, json!([])), (&second, json!([first]))] {
        let version = json!({
            "files": [], "mainFile": "index.ts", "log": { "date": "1700000000000" },
            "parents": parents, "flattenedDependencies": [], "buildStatus": "succeed",
        });
        write(repo, "Version", hash, &version);
    }
    let component = json!({
        "name": "comp1", "scope": "remote", "versions": { "0.0.1": first, "0.0.2": second },
        "lang": "javascript", "remotes": [], "schema": "2.0.0", "head": second,
    });
    write(repo, "Component", &component_hash("remote", "comp1"), &component);
    let hash = version_history_hash("remote", "comp1");
    write(repo, "VersionHistory", &hash, &history(history_versions, &[]));
    (first, second)
}

fn requested() -> Id {
    Id::parse("remote/comp1@0.0.2").unwrap()
}

#[test]
fn a_complete_history_records_the_version_in_bit_key_order() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let first = sha1_hex("first");
    let second = sha1_hex("second");
    store(
        &repo,
        &json!([
            { "parents": [first], "hash": second, "squashed": null },
            { "hash": first, "parents": [], "unrelated": "u" },
        ]),
    );
    assert!(incomplete(&repo, &[requested()]).unwrap().is_empty());
    let stored = repo
        .read_json(&version_history_hash("remote", "comp1"))
        .unwrap()
        .unwrap();
    assert_eq!(stored["graphCompleteRefs"], json!([second]));
    let keys: Vec<&String> = stored
        .as_object()
        .unwrap()
        .keys()
        .collect();
    assert_eq!(keys, ["name", "scope", "versions", "graphCompleteRefs"]);
    assert_eq!(stored["versions"][0], json!({ "hash": second, "parents": [first] }));
    assert_eq!(stored["versions"][1], json!({ "hash": first, "parents": [], "unrelated": "u" }));
}

#[test]
fn only_versioned_ids_with_a_stored_history_are_checked() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    let second = sha1_hex("second");
    store(&repo, &json!([{ "hash": second, "parents": [sha1_hex("first")] }]));
    assert_eq!(incomplete(&repo, &[requested()]).unwrap(), [requested()]);
    let unversioned = requested().with_version(None);
    let absent = Id::parse("remote/other@0.0.1").unwrap();
    assert!(incomplete(&repo, &[unversioned, absent]).unwrap().is_empty());
    store(&repo, &json!([]));
    assert!(incomplete(&repo, &[requested()]).unwrap().is_empty(), "an empty history is skipped");
}

#[test]
fn an_unknown_version_of_a_stored_history_is_an_error() {
    let dir = TempDir::new().unwrap();
    let repo = Repo::new(dir.path());
    store(&repo, &json!([{ "hash": sha1_hex("first"), "parents": [] }]));
    let error = incomplete(&repo, &[Id::parse("remote/comp1@9.9.9").unwrap()]).unwrap_err();
    assert_eq!(
        error.to_string(),
        "importMany, a ref for remote/comp1@9.9.9 is needed for version-history validation",
    );
}

/// The workspace holds `0.0.2` with a history that lacks its parent, and the
/// remote head is known locally, so only the history check can trigger a fetch.
fn workspace_with_incomplete_history(dir: &Path) -> (Repo, Repo) {
    let remote = dir.join("remote");
    fs::create_dir_all(&remote).unwrap();
    fs::write(remote.join("scope.json"), r#"{ "name": "remote" }"#).unwrap();
    let remote_repo = Repo::new(&remote);
    let (first, second) = store(
        &remote_repo,
        &json!([
            { "hash": sha1_hex("second"), "parents": [sha1_hex("first")] },
            { "hash": sha1_hex("first"), "parents": [] },
        ]),
    );
    let local = dir.join("ws/.bit");
    fs::create_dir_all(&local).unwrap();
    let repo = Repo::new(&local);
    store(&repo, &json!([{ "hash": second, "parents": [first] }]));
    let head = RemoteRef { scope: "remote".into(), name: "comp1".into(), head: second };
    repo.add_remote_refs("remote", "main", &[head])
        .unwrap();
    (repo, remote_repo)
}

fn import(repo: &Repo, dir: &Path, refetch_incomplete_history: bool) {
    let global = GlobalConfig::default();
    let hosts =
        json!({ "remotes": { "remote": format!("file://{}", dir.join("remote").display()) } });
    let remotes = Remotes::load(&hosts, dir, &global).unwrap();
    let network = Network::new(&global, "1.0.0", None, None).unwrap();
    let fetcher = Fetcher { remotes: &remotes, network: &network, concurrency: 1 };
    let importer = Importer {
        repo,
        fetcher: &fetcher,
        local_scope: "ws-local",
        lane: None,
        output: None,
        refetch_incomplete_history,
    };
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(importer.import(&[requested()]))
        .unwrap();
}

#[test]
fn the_flag_refetches_components_with_an_incomplete_history() {
    let dir = TempDir::new().unwrap();
    let (repo, _) = workspace_with_incomplete_history(dir.path());
    let hash = version_history_hash("remote", "comp1");
    import(&repo, dir.path(), false);
    assert_eq!(
        repo.read_json(&hash).unwrap().unwrap()["versions"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    import(&repo, dir.path(), true);
    let stored = repo.read_json(&hash).unwrap().unwrap();
    assert_eq!(
        stored["versions"]
            .as_array()
            .unwrap()
            .len(),
        2,
        "{stored}",
    );
}
