use super::serve;
use flate2::read::ZlibDecoder;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{Cursor, Read},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-snapshot-{}-{}",
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
fn hash(body: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(body))
}
fn hex(body: &[u8]) -> String {
    crate::validate::hexadecimal(body)
}
fn source(body: &[u8]) -> Value {
    json!({"type":"Source","hash":hash(body),"body":hex(body)})
}
fn frame(value: &Value) -> Vec<u8> {
    let body = serde_json::to_vec(value).unwrap();
    let mut bytes = 27_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(&(body.len() as u32).to_be_bytes());
    bytes.extend_from_slice(&body);
    bytes
}
fn response(value: &Value) -> Value {
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame(value)), &mut output).unwrap();
    serde_json::from_slice(&output).unwrap()
}
fn read(directory: &Directory, hash: &str) -> Vec<u8> {
    let mut bytes = Vec::new();
    ZlibDecoder::new(
        fs::File::open(
            directory.0
                .join(&hash[..2])
                .join(&hash[2..]),
        )
        .unwrap(),
    )
    .read_to_end(&mut bytes)
    .unwrap();
    bytes
}
fn policy() -> Value {
    json!({"kind":"plan","hash":"1".repeat(40),"version":"1.0.0","head":"2".repeat(40),"hasTag":false,"tag":true,"isLegacy":false,"setHeadAsParent":false,"detachHead":false,"overrideHead":false})
}
#[test]
fn commits_sources_and_random_identity_versions_with_canonical_headers() {
    let directory = Directory::new();
    let body = "emoji 😀 café 日本語".as_bytes();
    let binary = b"\xff\0\r\n";
    let version = "3".repeat(40);
    let metadata = r#" {"mainFile":"file","files":[],"log":{"message":"😀"}} "#.as_bytes();
    let result = response(
        &json!({"kind":"commit","objectsDirectory":directory.0,"owner":null,"objects":[source(body),source(binary),{"type":"Version","hash":version,"body":hex(metadata)}]}),
    );
    assert_eq!(result["completed"], 3);
    assert_eq!(result["failed"], false);
    for (kind, hash, body) in [
        ("Source", hash(body), body),
        ("Source", hash(binary), binary.as_slice()),
        ("Version", version, metadata),
    ] {
        let header =
            format!("{kind} {hash} {}\0", String::from_utf8_lossy(body).encode_utf16().count());
        let inflated = read(&directory, &hash);
        assert_eq!(inflated, [header.as_bytes(), body].concat());
        let written = result["data"]["written"]
            .as_array()
            .unwrap()
            .iter()
            .find(|file| file["hash"] == hash)
            .unwrap();
        assert_eq!(written["inflatedSize"], inflated.len());
        assert_eq!(
            written["compressedSize"],
            fs::metadata(
                directory.0
                    .join(&hash[..2])
                    .join(&hash[2..])
            )
            .unwrap()
            .len(),
        );
    }
}
#[test]
fn workspace_sources_verify_raw_snapshot_strip_bom_and_normalize_linux_eol() {
    let directory = Directory::new();
    let workspace = directory.0.join("workspace");
    let raw = b"\xef\xbb\xbfa\r\nb\rc\n";
    fs::write(&workspace, raw).unwrap();
    let expected = b"a\nb\nc\n";
    let sourcehash = hash(expected);
    let request = json!({"kind":"commit","objectsDirectory":directory.0.join("objects"),"owner":null,"objects":[{"type":"Source","hash":sourcehash,"workspace":{"path":workspace,"hash":hash(raw)}}]});
    assert_eq!(response(&request)["completed"], 1);
    let mut inflated = Vec::new();
    ZlibDecoder::new(
        fs::File::open(
            directory.0
                .join("objects")
                .join(&sourcehash[..2])
                .join(&sourcehash[2..]),
        )
        .unwrap(),
    )
    .read_to_end(&mut inflated)
    .unwrap();
    assert!(inflated.ends_with(expected));
    fs::write(workspace, b"stale").unwrap();
    let result = response(&request);
    assert_eq!(result["completed"], 0);
    assert_eq!(result["failed"], true);
}
#[test]
fn preflight_rejects_entire_invalid_batches_before_creating_store() {
    let directory = Directory::new();
    let target = directory.0.join("objects");
    let first = source(b"valid");
    for last in [
        json!({"type":"Source","hash":"4".repeat(40),"body":hex(b"wrong")}),
        json!({"type":"Version","hash":"4".repeat(40),"body":hex(b"[]")}),
        json!({"type":"Version","hash":"4".repeat(40),"body":"odd"}),
        json!({"type":"Unknown","hash":"4".repeat(40),"body":""}),
        first.clone(),
    ] {
        let result = response(
            &json!({"kind":"commit","objectsDirectory":target,"owner":null,"objects":[first,last]}),
        );
        assert_eq!(result["completed"], 0);
        assert_eq!(result["failed"], true);
        assert!(!target.exists());
    }
}
#[test]
fn acknowledges_written_prefix_and_stops_before_suffix_on_filesystem_failure() {
    let directory = Directory::new();
    let first = source(b"first");
    let second = source(b"second");
    let last = source(b"last");
    let blocked = second["hash"].as_str().unwrap();
    fs::write(directory.0.join(&blocked[..2]), b"block").unwrap();
    let result = response(
        &json!({"kind":"commit","objectsDirectory":directory.0,"owner":null,"objects":[first,second,last]}),
    );
    assert_eq!(result["completed"], 1);
    assert_eq!(result["failed"], true);
    assert_eq!(
        result["data"]["written"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let last = last["hash"].as_str().unwrap();
    assert!(
        !directory.0
            .join(&last[..2])
            .join(&last[2..])
            .exists(),
    );
}
#[test]
fn plan_preserves_main_parent_head_detachment_and_legacy_policy() {
    let mut request = policy();
    let head = request["head"].clone();
    assert_eq!(response(&request)["data"], json!({"parent":head,"detached":false,"tag":true}));
    request["parent"] = json!("5".repeat(40));
    assert_eq!(response(&request)["failed"], true);
    request["detachHead"] = json!(true);
    let result = response(&request);
    assert_eq!(result["data"]["detached"], true);
    assert_eq!(result["data"]["parent"], request["parent"]);
    request["setHeadAsParent"] = json!(true);
    assert_eq!(response(&request)["data"]["parent"], head);
    request["overrideHead"] = json!(true);
    assert_eq!(response(&request)["failed"], true);
    request["detachHead"] = json!(false);
    assert_eq!(response(&request)["data"]["detached"], false);
    request["isLegacy"] = json!(true);
    assert!(response(&request)["data"].get("parent").is_none());
}
#[test]
fn plan_skips_parent_mutation_for_existing_tag_same_head_or_no_head() {
    let mut request = policy();
    request["hasTag"] = json!(true);
    assert!(response(&request)["data"].get("parent").is_none());
    request["hasTag"] = json!(false);
    request["version"] = request["head"].clone();
    assert!(response(&request)["data"].get("parent").is_none());
    request
        .as_object_mut()
        .unwrap()
        .remove("head");
    assert!(response(&request)["data"].get("parent").is_none());
    assert_eq!(response(&request)["data"]["detached"], false);
}
#[test]
fn index_projection_reuses_existing_add_and_lane_rename_logic() {
    let request = json!({"kind":"index","components":[{"hash":"a","id":{"name":"existing"}}],"lanes":[{"hash":"l","id":"old"}],"objects":[{"hash":"a","id":{"name":"existing"},"category":"component"},{"hash":"b","id":{"name":"new"},"category":"component"},{"hash":"l","id":"renamed","category":"lane"},{"hash":"c","id":"new-lane","category":"lane"}]});
    assert_eq!(
        response(&request)["data"]["actions"],
        json!([["add", 1, 1], ["rename", 2, 0], ["add", 3, 1]]),
    );
    let mut invalid = request;
    invalid["objects"][0]["category"] = json!("unsupported");
    assert_eq!(response(&invalid)["failed"], true);
}
#[cfg(target_os = "linux")]
#[test]
fn index_write_preserves_exact_json_bytes_and_existing_mode() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let directory = Directory::new();
    let objects = directory.0.join("objects");
    fs::create_dir(&objects).unwrap();
    let index = directory.0.join("index.json");
    fs::write(&index, b"{}").unwrap();
    fs::set_permissions(&index, fs::Permissions::from_mode(0o640)).unwrap();
    let before = fs::metadata(&index).unwrap();
    let contents = r#" {"components":[],"lanes":[]} "#;
    assert_eq!(
        response(
            &json!({"kind":"indexWrite","objectsDirectory":objects,"owner":null,"contents":contents})
        )["data"]["saved"],
        true,
    );
    assert_eq!(fs::read(&index).unwrap(), contents.as_bytes());
    assert_eq!(fs::metadata(index).unwrap().mode(), before.mode());
}
#[test]
fn invalid_and_truncated_frames_never_write_prefixes() {
    let directory = Directory::new();
    let target = directory.0.join("objects");
    let bytes = frame(
        &json!({"kind":"commit","objectsDirectory":target,"owner":null,"objects":[source(b"source")]}),
    );
    for length in 0..bytes.len() {
        let mut output = Vec::new();
        assert!(serve(&mut Cursor::new(&bytes[..length]), &mut output).is_err());
        assert!(output.is_empty());
        assert!(!target.exists());
    }
    assert_eq!(
        response(&json!({"kind":"commit","objectsDirectory":"relative","owner":null,"objects":[]}))
            ["failed"],
        true,
    );
}
#[test]
fn workspace_sources_preserve_binary_and_only_strip_utf8_bom() {
    let directory = Directory::new();
    for (index, raw) in
        [b"\xef\xbb\xbf\0\r\n".as_slice(), b"\xff\xfe\0".as_slice(), b"\xef\xbb\xbf".as_slice()]
            .into_iter()
            .enumerate()
    {
        let path = directory.0.join(format!("file-{index}"));
        fs::write(&path, raw).unwrap();
        let expected = if raw.starts_with(b"\xef\xbb\xbf") { &raw[3..] } else { raw };
        let result = response(
            &json!({"kind":"commit","objectsDirectory":directory.0,"objects":[{"type":"Source","hash":hash(expected),"workspace":{"path":path,"hash":hash(raw)}}]}),
        );
        assert_eq!(result["completed"], 1);
        assert!(read(&directory, &hash(expected)).ends_with(expected));
    }
}
#[test]
fn excessive_workspace_bytes_counts_and_unknown_policy_fields_decline_without_mutation() {
    let directory = Directory::new();
    let path = directory.0.join("large");
    fs::File::create(&path)
        .unwrap()
        .set_len((super::MAX_RAW + 1) as u64)
        .unwrap();
    let objects = directory.0.join("objects");
    let result = response(
        &json!({"kind":"commit","objectsDirectory":objects,"objects":[source(b"valid"),{"type":"Source","hash":"a".repeat(40),"workspace":{"path":path,"hash":"b".repeat(40)}}]}),
    );
    assert_eq!(result["failed"], true);
    assert!(!objects.exists());
    let result = response(
        &json!({"kind":"commit","objectsDirectory":objects,"objects":vec![source(b""); super::MAX_FILES + 1]}),
    );
    assert_eq!(result["failed"], true);
    assert!(!objects.exists());
    let mut request = policy();
    request["unsupported"] = json!(true);
    assert_eq!(response(&request)["failed"], true);
}
