use std::{fs, io::Write, path::Path};

use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};

use crate::transfer::{
    State, apply,
    tests::{directory, source},
};

fn compressed(kind: &str, hash: &str, body: &Value) -> Vec<u8> {
    let text = body.to_string();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0{text}", text.len()).unwrap();
    encoder.finish().unwrap()
}

fn fixture(root: &Path, state: &mut State) -> Value {
    let (hash, _) = source(root, b"frozen\xff\r\n");
    let hash = crate::validate::hexadecimal(&hash);
    let version = "0101010101010101010101010101010101010101";
    let body = json!({"mainFile":"a","log":{},"files":[{"file":hash}],"extensions":[]});
    fs::create_dir_all(root.join("01")).unwrap();
    fs::write(root.join("01").join(&version[2..]), compressed("Version", version, &body)).unwrap();
    let staging = root.join("staging");
    fs::create_dir(&staging).unwrap();
    apply("transferCollect",&json!({"mode":"export","objectsDirectory":root,"stagingDirectory":staging,"versions":[{"hash":version,"locallyChanged":true,"expected":{"sources":[hash],"artifacts":[]}}]}),state).unwrap()
}

fn initialize(state: &mut State, collection: &Value) -> Value {
    let objects: Vec<_> = collection["objects"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| json!({"collectionToken":collection["token"],"index":row["index"]}))
        .collect();
    apply("transferInitialize", &json!({"objects":objects}), state).unwrap()
}

#[test]
fn compressed_spool_survives_helper_drop_and_archive_never_rereads_repository() {
    let root = directory();
    let mut state = State::default();
    let collection = fixture(&root, &mut state);
    let row = &collection["objects"][1];
    let spool = std::path::PathBuf::from(row["compressedPath"].as_str().unwrap());
    let frozen = fs::read(&spool).unwrap();
    let hash = row["hash"].as_str().unwrap();
    fs::write(root.join(&hash[..2]).join(&hash[2..]), b"changed after public compress hook")
        .unwrap();
    let initialized = initialize(&mut state, &collection);
    let first = root.join("first.tar");
    let second = root.join("second.tar");
    let request = |path: &Path, time: u32| json!({"token":initialized["token"],"path":path,"mtimeSeconds":[time,time]});
    let first_result = apply("transferArchive", &request(&first, 1), &mut state).unwrap();
    let second_result = apply("transferArchive", &request(&second, 2), &mut state).unwrap();
    assert_eq!(first_result["objectsHash"], second_result["objectsHash"]);
    assert_ne!(first_result["sha1"], second_result["sha1"]);
    drop(state);
    assert_eq!(fs::read(spool).unwrap(), frozen);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn fetch_archive_contains_exact_start_end_and_count() {
    let root = directory();
    let mut state = State::default();
    let collection = fixture(&root, &mut state);
    let plan = initialize(&mut state, &collection);
    let archive = root.join("fetch.tar");
    let result=apply("transferArchive",&json!({"token":plan["token"],"path":archive,"mode":"fetch","scopeName":"remote.scope","mtimeSeconds":[1,1,1,1]}),&mut state).unwrap();
    assert_eq!(result["count"], 2);
    let bytes = fs::read(archive).unwrap();
    assert_eq!(&bytes[..10], b".BIT.START");
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains(r#"{"schema":"1.0.0","scopeName":"remote.scope"}"#));
    assert!(text.contains(r#"{"numOfFiles":2,"scopeName":"remote.scope"}"#));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn whole_invalid_collection_leaves_private_directory_empty() {
    let root = directory();
    let mut state = State::default();
    let staging = root.join("staging");
    fs::create_dir(&staging).unwrap();
    let input = json!({"mode":"export","objectsDirectory":root,"stagingDirectory":staging,"versions":[{"hash":"0101010101010101010101010101010101010101","locallyChanged":true}]});
    assert!(apply("transferCollect", &input, &mut state).is_err());
    assert_eq!(fs::read_dir(staging).unwrap().count(), 0);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn source_inline_is_rejected_before_replacing_owned_plan() {
    let root = directory();
    let mut state = State::default();
    let collection = fixture(&root, &mut state);
    let plan = initialize(&mut state, &collection);
    let (hash, bytes) = source(&root, b"inline forbidden");
    let input = json!({"objects":[{"metadata":{"hash":crate::validate::hexadecimal(&hash),"compressed":crate::validate::hexadecimal(&bytes)}}]});
    assert!(apply("transferInitialize", &input, &mut state).is_err());
    assert!(state.plans.contains_key(plan["token"].as_str().unwrap()));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn pending_error_acknowledges_only_committed_prefix() {
    let root = directory();
    let mut state = State::default();
    let collection = fixture(&root, &mut state);
    let plan = initialize(&mut state, &collection);
    let pending = root.join("pending");
    fs::create_dir(&pending).unwrap();
    let hash = collection["objects"][1]["hash"].as_str().unwrap();
    fs::write(pending.join(&hash[..2]), b"not a directory").unwrap();
    let result =
        apply("transferPending", &json!({"token":plan["token"],"pendingDir":pending}), &mut state)
            .unwrap();
    assert_eq!(result, json!({"completed":1,"count":2,"failed":true}));
    assert!(
        pending
            .join("01")
            .join(
                "0101010101010101010101010101010101010101"
                    .get(2..)
                    .unwrap()
            )
            .is_file(),
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn repeated_collections_and_multiple_plans_keep_direct_child_spools() {
    let root = directory();
    let mut state = State::default();
    let collection = fixture(&root, &mut state);
    let staging = root.join("staging");
    let hash = collection["objects"][1]["hash"].as_str().unwrap();
    let request = json!({"mode":"objects","objectsDirectory":root,"stagingDirectory":staging,"refs":[hash,hash],"gracefulMissing":true});
    let second = apply("transferCollect", &request, &mut state).unwrap();
    assert_eq!(second["count"], 1);
    let first_plan = initialize(&mut state, &collection);
    let second_plan = initialize(&mut state, &second);
    assert_ne!(first_plan["token"], second_plan["token"]);
    assert!(state.plans.contains_key(first_plan["token"].as_str().unwrap()));
    assert!(state.plans.contains_key(second_plan["token"].as_str().unwrap()));
    assert_eq!(
        Path::new(second["objects"][0]["compressedPath"].as_str().unwrap()).parent(),
        Some(staging.as_path()),
    );
    assert!(apply("transferCollect",&json!({"mode":"objects","objectsDirectory":root,"stagingDirectory":staging,"refs":[hash],"gracefulMissing":true,"unsupported":true}),&mut state).is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn archive_unsupported_late_name_preserves_existing_private_candidate() {
    let root = directory();
    let mut state = State::default();
    let collection = fixture(&root, &mut state);
    let objects=collection["objects"].as_array().unwrap().iter().map(|row|json!({"collectionToken":collection["token"],"index":row["index"],"scope":"a".repeat(156)})).collect::<Vec<_>>();
    let plan = apply("transferInitialize", &json!({"objects":objects}), &mut state).unwrap();
    let candidate = root.join("candidate.tar");
    fs::write(&candidate, []).unwrap();
    assert!(
        apply(
            "transferArchive",
            &json!({"token":plan["token"],"path":candidate,"mtimeSeconds":[1,1]}),
            &mut state,
        )
        .is_err(),
    );
    assert!(candidate.exists());
    assert!(fs::read(candidate).unwrap().is_empty());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn truncated_or_trailing_source_streams_never_publish_partial_collection() {
    let root = directory();
    let staging = root.join("empty");
    fs::create_dir(&staging).unwrap();
    let (valid, _) = source(&root, b"first valid object");
    let (hash, compressed) = source(&root, b"later source stream");
    let text = crate::validate::hexadecimal(&hash);
    let path = root.join(&text[..2]).join(&text[2..]);
    let request = json!({"mode":"objects","objectsDirectory":root,"stagingDirectory":staging,"refs":[crate::validate::hexadecimal(&valid),text],"gracefulMissing":true});
    for length in 0..compressed.len() {
        fs::write(&path, &compressed[..length]).unwrap();
        assert!(apply("transferCollect", &request, &mut State::default()).is_err());
        assert_eq!(fs::read_dir(&staging).unwrap().count(), 0);
    }
    let mut trailing = compressed;
    trailing.push(0);
    fs::write(path, trailing).unwrap();
    assert!(apply("transferCollect", &request, &mut State::default()).is_err());
    assert_eq!(fs::read_dir(staging).unwrap().count(), 0);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn graceful_missing_indices_preserve_duplicates_and_keep_owned_session() {
    let root = directory();
    let staging = root.join("staging");
    fs::create_dir(&staging).unwrap();
    let missing = "9".repeat(40);
    let mut state = State::default();
    let empty=apply("transferCollect",&json!({"mode":"objects","objectsDirectory":root,"stagingDirectory":staging,"refs":[missing,missing],"gracefulMissing":true}),&mut state).unwrap();
    assert_eq!(empty["count"], 0);
    assert_eq!(empty["objects"], json!([]));
    assert_eq!(empty["missingIndices"], json!([0, 1]));
    assert!(state.collections.contains_key(empty["token"].as_str().unwrap()));
    assert_eq!(fs::read_dir(&staging).unwrap().count(), 0);
    let (hash, _) = source(&root, b"present after missing probe");
    let hash = crate::validate::hexadecimal(&hash);
    let mixed=apply("transferCollect",&json!({"mode":"objects","objectsDirectory":root,"stagingDirectory":staging,"refs":[missing,hash,missing,hash],"gracefulMissing":true}),&mut state).unwrap();
    assert_eq!(mixed["count"], 1);
    assert_eq!(mixed["missingIndices"], json!([0, 2]));
    assert_eq!(mixed["objects"][0]["hash"], hash);
    let plan = initialize(&mut state, &mixed);
    assert_eq!(plan["count"], 1);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn graceful_mode_does_not_skip_invalid_objects_or_directory_errors() {
    let root = directory();
    let staging = root.join("staging");
    fs::create_dir(&staging).unwrap();
    let (hash, _) = source(&root, b"corrupt source");
    let hash = crate::validate::hexadecimal(&hash);
    let path = root.join(&hash[..2]).join(&hash[2..]);
    fs::write(&path, b"not zlib").unwrap();
    let request = json!({"mode":"objects","objectsDirectory":root,"stagingDirectory":staging,"refs":["9".repeat(40),hash],"gracefulMissing":true});
    assert!(apply("transferCollect", &request, &mut State::default()).is_err());
    assert_eq!(fs::read_dir(&staging).unwrap().count(), 0);
    fs::remove_file(&path).unwrap();
    fs::create_dir(path).unwrap();
    assert!(apply("transferCollect", &request, &mut State::default()).is_err());
    assert_eq!(fs::read_dir(staging).unwrap().count(), 0);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn release_keeps_shared_spools_until_last_owner_and_preserves_unowned_files() {
    let root = directory();
    let mut state = State::default();
    let collection = fixture(&root, &mut state);
    let plan = initialize(&mut state, &collection);
    let spool = Path::new(collection["objects"][0]["compressedPath"].as_str().unwrap());
    let unowned = spool.parent().unwrap().join("keep");
    fs::write(&unowned, b"unowned").unwrap();
    apply("transferRelease", &json!({"token":collection["token"]}), &mut state).unwrap();
    assert!(spool.is_file());
    apply("transferRelease", &json!({"token":plan["token"]}), &mut state).unwrap();
    assert!(!spool.exists());
    assert_eq!(fs::read(unowned).unwrap(), b"unowned");
    assert!(state.spool_paths.is_empty());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn cancellation_releases_owned_files_and_invalidates_all_retained_transfer_receipts() {
    let root = directory();
    let mut state = State::default();
    let collection = fixture(&root, &mut state);
    let plan = initialize(&mut state, &collection);
    let transaction = apply(
        "transferTransactionInitialize",
        &json!({"scopes":["remote.scope"],"clientId":"client","resuming":false}),
        &mut state,
    )
    .unwrap();
    let spool = Path::new(collection["objects"][0]["compressedPath"].as_str().unwrap());
    let result = apply("transferCancel", &json!({}), &mut state).unwrap();
    assert_eq!(result, json!({"cancelled":true,"releasedCollections":1,"releasedPlans":1}));
    assert!(!spool.exists());
    assert!(apply("transferRelease", &json!({"token":plan["token"]}), &mut state).is_err());
    assert!(
        apply(
            "transferTransactionReceipt",
            &json!({"token":transaction["token"],"revision":0,"success":true}),
            &mut state,
        )
        .is_err(),
    );
    assert!(state.spool_paths.is_empty());
    fs::remove_dir_all(root).unwrap();
}
