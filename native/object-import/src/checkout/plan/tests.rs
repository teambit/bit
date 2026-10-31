use super::{plain_tag, serve};
use crate::checkout::cache::State;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-checkout-plan-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn store(directory: &Path, hash: &str, kind: &str, body: &[u8]) {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0", body.len()).unwrap();
    encoder.write_all(body).unwrap();
    fs::create_dir_all(directory.join(&hash[..2])).unwrap();
    fs::write(
        directory
            .join(&hash[..2])
            .join(&hash[2..]),
        encoder.finish().unwrap(),
    )
    .unwrap();
}
fn setup(directory: &Path) -> Value {
    let component = "1".repeat(40);
    let version = "2".repeat(40);
    let bytes = b"target";
    let hash = crate::validate::hexadecimal(&Sha1::digest(bytes));
    store(directory, &hash, "Source", bytes);
    store(
        directory,
        &component,
        "Component",
        serde_json::to_string(&json!({"versions":{"1.0.0":version}})).unwrap().as_bytes(),
    );
    store(directory,&version,"Version",serde_json::to_string(&json!({"files":[{"file":hash,"relativePath":"target.ts","name":"target.ts","test":false}]})).unwrap().as_bytes());
    json!({"objectsDirectory":directory,"componentHash":component,"requestedVersion":"1.0.0","expectedVersionHash":version,"current":[],"expectedFiles":[{"hash":hash,"relativePath":"target.ts","name":"target.ts","test":false}]})
}
fn frame(value: &Value) -> Vec<u8> {
    let body = serde_json::to_vec(value).unwrap();
    let mut bytes = 42_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(&(body.len() as u32).to_be_bytes());
    bytes.extend_from_slice(&body);
    bytes
}
fn response(value: &Value, state: &mut State) -> Value {
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame(value)), &mut output, state).unwrap();
    serde_json::from_slice(&output).unwrap()
}
#[test]
fn resolves_tags_reads_manifests_and_plans_in_order_without_mutation() {
    let directory = Directory::new();
    let mut request = setup(&directory.0);
    let target_hash = request["expectedFiles"][0]["hash"].clone();
    let stale = directory.0.join("stale");
    fs::write(&stale, b"preserve").unwrap();
    request["current"] = json!([
        {"relativePath":"target.ts","hash":target_hash,"path":directory.0.join("target.ts"),"protected":false},
        {"relativePath":".bitmap","hash":"3".repeat(40),"path":directory.0.join(".bitmap"),"protected":true},
        {"relativePath":"stale","hash":"4".repeat(40),"path":stale,"protected":false}
    ]);
    let result = response(&request, &mut State::default());
    assert_eq!(result["completed"], 1);
    assert_eq!(result["failed"], false);
    assert_eq!(
        result["plan"]["statuses"],
        json!([{"relativePath":"target.ts","status":"unchanged"},{"relativePath":"stale","status":"removed"}]),
    );
    assert_eq!(result["plan"]["removals"], json!([stale]));
    assert_eq!(fs::read(stale).unwrap(), b"preserve");
    assert!(!directory.0.join("target.ts").exists());
}
#[test]
fn updates_missing_or_changed_snapshots_and_never_removes_protected_files() {
    let directory = Directory::new();
    let mut request = setup(&directory.0);
    request["current"] = json!([{"relativePath":"target.ts","hash":"5".repeat(40),"path":directory.0.join("target.ts"),"protected":false}]);
    assert_eq!(
        response(&request, &mut State::default())["plan"]["statuses"][0]["status"],
        "updated",
    );
    request["current"] = json!([]);
    assert_eq!(
        response(&request, &mut State::default())["plan"]["statuses"][0]["status"],
        "updated",
    );
}
#[test]
fn resolves_orphaned_tags_before_versions_and_full_hashes_directly() {
    let directory = Directory::new();
    let mut request = setup(&directory.0);
    let component = request["componentHash"].as_str().unwrap();
    let version = request["expectedVersionHash"].as_str().unwrap();
    store(
        &directory.0,
        component,
        "Component",
        serde_json::to_string(
            &json!({"versions":{"1.0.0":"6".repeat(40)},"orphanedVersions":{"1.0.0":version}}),
        )
        .unwrap()
        .as_bytes(),
    );
    assert_eq!(response(&request, &mut State::default())["failed"], false);
    request["requestedVersion"] = request["expectedVersionHash"].clone();
    assert_eq!(response(&request, &mut State::default())["failed"], false);
    for version in ["latest", "abc123", "invalid", "v1.0.0"] {
        request["requestedVersion"] = json!(version);
        assert_eq!(response(&request, &mut State::default())["failed"], true);
    }
}
#[test]
fn rejects_manifest_changes_unsupported_fields_and_duplicate_paths() {
    let directory = Directory::new();
    let original = setup(&directory.0);
    let mut cases = Vec::new();
    for field in ["hash", "relativePath", "name", "test"] {
        let mut value = original.clone();
        value["expectedFiles"][0][field] =
            if field == "test" { json!(true) } else { json!("changed") };
        cases.push(value);
    }
    let mut duplicate = original.clone();
    duplicate["expectedFiles"]
        .as_array_mut()
        .unwrap()
        .push(original["expectedFiles"][0].clone());
    cases.push(duplicate);
    let mut extra = original.clone();
    extra["expectedFiles"][0]["custom"] = json!(true);
    cases.push(extra);
    let mut null = original;
    null["expectedFiles"][0]["test"] = Value::Null;
    cases.push(null);
    for value in cases {
        let result = response(&value, &mut State::default());
        assert_eq!(result["failed"], true);
        assert_eq!(result["completed"], 0);
        assert!(result.get("plan").is_none());
    }
}
#[test]
fn optional_metadata_stays_absent_and_does_not_coerce_false() {
    let directory = Directory::new();
    let mut request = setup(&directory.0);
    let version = request["expectedVersionHash"].as_str().unwrap();
    let hash = request["expectedFiles"][0]["hash"].clone();
    store(
        &directory.0,
        version,
        "Version",
        serde_json::to_string(&json!({"files":[{"file":hash,"relativePath":"target.ts"}]}))
            .unwrap()
            .as_bytes(),
    );
    request["expectedFiles"] = json!([{"hash":hash,"relativePath":"target.ts"}]);
    let result = response(&request, &mut State::default());
    assert_eq!(result["failed"], false);
    assert!(result["plan"]["files"][0].get("test").is_none());
    assert!(result["plan"]["files"][0].get("name").is_none());
    request["expectedFiles"][0]["test"] = json!(false);
    assert_eq!(response(&request, &mut State::default())["failed"], true);
}
#[test]
fn corrupt_or_missing_sources_fail_before_any_removal_and_cached_sources_are_rechecked() {
    let directory = Directory::new();
    let request = setup(&directory.0);
    let mut state = State::default();
    assert_eq!(response(&request, &mut state)["failed"], false);
    let hash = request["expectedFiles"][0]["hash"].as_str().unwrap();
    let path = directory.0
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::write(&path, b"corrupt").unwrap();
    assert_eq!(response(&request, &mut state)["failed"], true);
    fs::remove_file(path).unwrap();
    assert_eq!(response(&request, &mut state)["failed"], true);
}
#[test]
fn incomplete_frames_never_emit_partial_plans() {
    let directory = Directory::new();
    let request = setup(&directory.0);
    let bytes = frame(&request);
    for length in 0..bytes.len() {
        let mut output = Vec::new();
        assert!(
            serve(&mut Cursor::new(&bytes[..length]), &mut output, &mut State::default()).is_err(),
        );
        assert!(output.is_empty());
    }
    for length in [0_u32, 4 * 1024 * 1024 + 1, u32::MAX] {
        let mut bytes = 42_u32.to_be_bytes().to_vec();
        bytes.extend_from_slice(&length.to_be_bytes());
        assert!(serve(&mut Cursor::new(bytes), &mut Vec::new(), &mut State::default()).is_err());
    }
}
#[test]
fn rejects_unsafe_paths_special_keys_and_metadata_identity_changes() {
    let directory = Directory::new();
    let original = setup(&directory.0);
    for path in [
        "../escape",
        "/absolute",
        "nested/../escape",
        r"nested\file",
        "a//b",
        "__proto__",
        "constructor",
        "prototype",
        "C:drive",
    ] {
        let mut request = original.clone();
        request["expectedFiles"][0]["relativePath"] = json!(path);
        assert_eq!(response(&request, &mut State::default())["failed"], true);
    }
    let mut request = original.clone();
    request["expectedVersionHash"] = json!("7".repeat(40));
    assert_eq!(response(&request, &mut State::default())["failed"], true);
    let component = original["componentHash"].as_str().unwrap();
    store(&directory.0, component, "Version", b"{}");
    assert_eq!(response(&original, &mut State::default())["failed"], true);
}
#[test]
fn plain_semver_support_is_conservative_and_never_treats_latest_or_short_hash_as_tags() {
    for tag in ["1.2.3", "0.0.0", "1.2.3-alpha.1", "1.2.3+build.01", "1.2.3-rc.1+build"] {
        assert!(plain_tag(tag));
    }
    for tag in
        ["latest", "abc123", "v1.2.3", "01.2.3", "1.2", "1.2.3-01", "1.2.3+", "1.2.3-alpha_1"]
    {
        assert!(!plain_tag(tag));
    }
}

#[test]
fn accepts_reordered_live_manifests_and_preserves_live_order() {
    let directory = Directory::new();
    let mut request = setup(&directory.0);
    let version = request["expectedVersionHash"].as_str().unwrap();
    let first = request["expectedFiles"][0].clone();
    let mut second = first.clone();
    second["relativePath"] = json!("other.ts");
    second["name"] = json!("other.ts");
    store(&directory.0,version,"Version",serde_json::to_string(&json!({"files":[
        {"file":first["hash"],"relativePath":first["relativePath"],"name":first["name"],"test":first["test"]},
        {"file":second["hash"],"relativePath":second["relativePath"],"name":second["name"],"test":second["test"]}
    ]})).unwrap().as_bytes());
    request["expectedFiles"] = json!([second, first]);
    let result = response(&request, &mut State::default());
    assert_eq!(result["failed"], false);
    assert_eq!(result["plan"]["files"], request["expectedFiles"]);
    assert_eq!(result["plan"]["statuses"][0]["relativePath"], "other.ts");
    assert_eq!(result["plan"]["statuses"][1]["relativePath"], "target.ts");
}

#[test]
fn preflights_more_than_one_write_batch_and_reuses_verified_sources() {
    let directory = Directory::new();
    let mut request = setup(&directory.0);
    let hash = request["expectedFiles"][0]["hash"].clone();
    let expected: Vec<_> = (0..129)
        .map(|index| json!({"hash":hash,"relativePath":format!("file-{index}.ts")}))
        .collect();
    let stored: Vec<_> = expected
        .iter()
        .map(|file| json!({"file":file["hash"],"relativePath":file["relativePath"]}))
        .collect();
    store(
        &directory.0,
        request["expectedVersionHash"].as_str().unwrap(),
        "Version",
        serde_json::to_string(&json!({"files":stored})).unwrap().as_bytes(),
    );
    request["expectedFiles"] = json!(expected);
    let mut state = State::default();
    let result = response(&request, &mut state);
    assert_eq!(result["completed"], 129);
    assert_eq!(result["failed"], false);
    let hash = super::hash(hash.as_str().unwrap()).unwrap();
    assert_eq!(state.get(&directory.0, hash).unwrap(), b"target");
}

#[test]
fn rejects_whole_plan_source_bytes_beyond_budget_before_mutation() {
    let directory = Directory::new();
    let mut request = setup(&directory.0);
    let body = vec![b'x'; 17 * 1024 * 1024];
    let hash = crate::validate::hexadecimal(&Sha1::digest(&body));
    store(&directory.0, &hash, "Source", &body);
    let files = json!([{"file":hash,"relativePath":"first"},{"file":hash,"relativePath":"second"}]);
    store(
        &directory.0,
        request["expectedVersionHash"].as_str().unwrap(),
        "Version",
        serde_json::to_string(&json!({"files":files})).unwrap().as_bytes(),
    );
    request["expectedFiles"] =
        json!([{"hash":hash,"relativePath":"first"},{"hash":hash,"relativePath":"second"}]);
    let result = response(&request, &mut State::default());
    assert_eq!(result["completed"], 0);
    assert_eq!(result["failed"], true);
    assert!(!directory.0.join("first").exists());
}
