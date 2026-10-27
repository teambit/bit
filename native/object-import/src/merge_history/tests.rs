static POOL: std::sync::LazyLock<rayon::ThreadPool> = std::sync::LazyLock::new(|| {
    rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap()
});
use super::serve;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{Cursor, Write},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-history-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn store(&self, kind: &str, hash: &str, body: &[u8]) {
        let directory = self.0.join(&hash[..2]);
        fs::create_dir_all(&directory).unwrap();
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(format!("{kind} {hash} {}\0", body.len()).as_bytes())
            .unwrap();
        encoder.write_all(body).unwrap();
        fs::write(directory.join(&hash[2..]), encoder.finish().unwrap()).unwrap();
    }
    fn source(&self, body: &[u8]) -> String {
        let hash = digest(body);
        self.store("Source", &hash, body);
        hash
    }
    fn version(&self, hash: &str, parents: &[String]) {
        self.store(
            "Version",
            hash,
            serde_json::to_string(
                &json!({"mainFile":"index.js","files":[],"log":{},"parents":parents}),
            )
            .unwrap()
            .as_bytes(),
        );
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn digest(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
fn response(value: &Value) -> Value {
    let json = serde_json::to_vec(value).unwrap();
    let mut bytes = 5_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(&(json.len() as u32).to_be_bytes());
    bytes.extend_from_slice(&json);
    let mut output = Vec::new();
    serve(&mut Cursor::new(bytes), &mut output, &POOL).unwrap();
    serde_json::from_slice(&output).unwrap()
}
fn graph(directory: &Directory, head: &str) -> Value {
    json!({"kind":"graph","objectsDirectory":directory.0,"heads":[head],"cached":[],"overlay":[],"from":head,"stopAt":[]})
}
fn record(hash: &str, parents: &[&str]) -> Value {
    json!({"hash":hash,"parents":parents})
}
#[test]
fn reads_verified_repository_versions_in_preorder_and_subset_order() {
    let directory = Directory::new();
    let [a, b, c, d] = ["1".repeat(40), "2".repeat(40), "3".repeat(40), "4".repeat(40)];
    directory.version(&a, &[b.clone(), c.clone()]);
    directory.version(&b, std::slice::from_ref(&d));
    directory.version(&c, std::slice::from_ref(&d));
    directory.version(&d, &[]);
    let result = response(&graph(&directory, &a));
    assert_eq!(result["completed"], 1);
    assert_eq!(result["data"]["hashes"], json!([a, b, d, c]));
    assert_eq!(result["data"]["added"][0]["hash"], a);
    assert_eq!(result["data"]["added"][2]["hash"], d);
}
#[test]
fn cached_records_stop_reads_and_overlay_replaces_without_reordering() {
    let directory = Directory::new();
    let [a, b] = ["1".repeat(40), "2".repeat(40)];
    let mut request = graph(&directory, &a);
    request["cached"] = json!([record(&a, &[]), record(&b, &[])]);
    request["overlay"] = json!([record(&a, &[&b])]);
    let result = response(&request);
    assert_eq!(result["failed"], false);
    assert_eq!(result["data"]["added"], json!([]));
    assert_eq!(result["data"]["hashes"], json!([a, b]));
    request["stopAt"] = json!([b]);
    assert_eq!(response(&request)["data"]["hashes"], json!([a]));
}
#[test]
fn missing_corrupt_and_wrong_identity_versions_decline_without_partial_results() {
    let directory = Directory::new();
    let head = "1".repeat(40);
    let parent = "2".repeat(40);
    directory.version(&head, std::slice::from_ref(&parent));
    let result = response(&graph(&directory, &head));
    assert_eq!(result["failed"], true);
    assert_eq!(result["completed"], 0);
    assert!(result.get("data").is_none());
    directory.store("Source", &parent, b"bad");
    assert_eq!(response(&graph(&directory, &head))["failed"], true);
}
#[test]
fn divergence_matches_branch_order_and_nearest_common_snap() {
    let [a, b, c, d] = ["1".repeat(40), "2".repeat(40), "3".repeat(40), "4".repeat(40)];
    let request = json!({"kind":"diverge","versions":[record(&a,&[&b]),record(&b,&[&d]),record(&c,&[&d]),record(&d,&[])],"sourceHead":a,"targetHead":c,"unmergedUnrelated":false});
    let result = response(&request);
    assert_eq!(
        result["data"],
        json!({"sourceOnly":[a,b],"targetOnly":[c],"common":d,"noCommon":false}),
    );
}
#[test]
fn divergence_uses_squashed_and_unrelated_only_when_parent_graphs_do_not_intersect() {
    let [a, b, c] = ["1".repeat(40), "2".repeat(40), "3".repeat(40)];
    let mut request = json!({"kind":"diverge","versions":[{"hash":a,"parents":[],"squashed":[c]},record(&b,&[&c]),record(&c,&[])],"sourceHead":a,"targetHead":b,"unmergedUnrelated":false});
    assert_eq!(
        response(&request)["data"],
        json!({"sourceOnly":[a],"targetOnly":[b],"common":c,"noCommon":false}),
    );
    request["versions"] = json!([record(&a, &[]), record(&b, &[])]);
    assert_eq!(response(&request)["data"]["noCommon"], true);
    request["unmergedUnrelated"] = json!(true);
    assert_eq!(response(&request)["data"]["noCommon"], false);
}
fn merge_request(directory: &Directory) -> Value {
    json!({"kind":"mergeFiles","objectsDirectory":directory.0,"labels":{"current":"local","other":"remote"},"base":[],"other":[],"current":[]})
}
fn model(path: &str, hash: &str) -> Value {
    json!({"path":path,"hash":hash})
}
fn current(path: &str, hash: &str) -> Value {
    json!({"path":path,"source":{"hash":hash}})
}
#[test]
fn merge_classifies_current_and_missing_files_with_duplicate_deleted_conflicts() {
    let directory = Directory::new();
    let old = directory.source(b"old\n");
    let new = directory.source(b"new\n");
    let mut request = merge_request(&directory);
    request["base"] = json!([
        model("remove", &old),
        model("updated", &old),
        model("deleted", &old),
        model("conflict", &old)
    ]);
    request["other"] = json!([
        model("same", &new),
        model("updated", &new),
        model("deleted", &old),
        model("conflict", &new),
        model("added", &new)
    ]);
    request["current"] = json!([
        current("new", &new),
        current("remove", &old),
        current("same", &new),
        current("updated", &old)
    ]);
    let result = response(&request);
    assert_eq!(result["failed"], false);
    let rows = result["data"]["files"].as_array().unwrap();
    let kinds: Vec<_> = rows
        .iter()
        .map(|row| row["kind"].as_str().unwrap())
        .collect();
    assert_eq!(
        kinds,
        vec![
            "addFiles",
            "removeFiles",
            "unModifiedFiles",
            "updatedFiles",
            "remainDeletedFiles",
            "deletedConflictFiles",
            "addFiles",
            "deletedConflictFiles"
        ],
    );
    assert!(rows[5].get("body").is_none());
    assert_eq!(rows[7]["body"], crate::validate::hexadecimal(b"new\n"));
    assert_eq!(rows[0]["currentHash"], new);
}
#[test]
fn merge_git_preserves_conflict_labels_final_newlines_and_normalized_source_hash() {
    let directory = Directory::new();
    let base = directory.source(b"base\n");
    let local = directory.source(b"local\r\n");
    let other = directory.source(b"remote\n");
    let mut request = merge_request(&directory);
    request["base"] = json!([model("file", &base)]);
    request["other"] = json!([model("file", &other)]);
    request["current"] = json!([current("file", &local)]);
    let result = response(&request);
    assert_eq!(result["failed"], false);
    let row = &result["data"]["files"][0];
    assert_eq!(row["currentHash"], digest(b"local\n"));
    assert!(row["output"].is_null());
    assert_eq!(row["conflict"], "<<<<<<< local\nlocal\n=======\nremote\n>>>>>>> remote\n");
    assert_eq!(result["data"]["hasConflicts"], true);
}
#[test]
fn merge_workspace_bom_snapshot_and_linux_identity_guard() {
    let directory = Directory::new();
    let raw = b"\xef\xbb\xbftext\r\n";
    let filepath = directory.0.join("workspace");
    fs::write(&filepath, raw).unwrap();
    let expected = directory.source(b"text\n");
    let mut request = merge_request(&directory);
    request["other"] = json!([model("file", &expected)]);
    request["current"] = json!([{"path":"file","workspace":{"path":filepath,"hash":digest(raw),"linuxHash":expected}}]);
    assert_eq!(response(&request)["data"]["files"][0]["kind"], "unModifiedFiles");
    fs::write(filepath, b"stale").unwrap();
    assert_eq!(response(&request)["failed"], true);
}
#[test]
fn merge_binary_conflicts_and_corrupt_later_sources_decline_whole_operation() {
    let directory = Directory::new();
    let base = directory.source(b"\0base");
    let local = directory.source(b"\0local");
    let other = directory.source(b"\0other");
    let mut request = merge_request(&directory);
    request["base"] = json!([model("file", &base)]);
    request["other"] = json!([model("file", &other)]);
    request["current"] = json!([current("file", &local)]);
    assert_eq!(response(&request)["data"]["files"][0]["isBinaryConflict"], true);
    request["other"] = json!([model("file", &other), model("bad", &"f".repeat(40))]);
    let result = response(&request);
    assert_eq!(result["failed"], true);
    assert!(result.get("data").is_none());
}
#[test]
fn partial_frames_and_duplicate_paths_do_not_return_partial_plans() {
    let mut bytes = 5_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(&10_u32.to_be_bytes());
    bytes.extend_from_slice(b"{}");
    let mut output = Vec::new();
    assert!(serve(&mut Cursor::new(bytes), &mut output, &POOL).is_err());
    assert!(output.is_empty());
    let directory = Directory::new();
    let source = directory.source(b"same");
    let mut request = merge_request(&directory);
    request["current"] = json!([current("same", &source), current("same", &source)]);
    assert_eq!(response(&request)["failed"], true);
}

#[test]
fn pure_divergence_same_head_preserves_common_snap() {
    let head = "a".repeat(40);
    let request = json!({"kind":"diverge","versions":[record(&head,&[])],"sourceHead":head,"targetHead":head,"unmergedUnrelated":false});
    assert_eq!(
        response(&request)["data"],
        json!({"sourceOnly":[],"targetOnly":[],"common":head,"noCommon":false}),
    );
}

#[test]
fn ordinary_graph_constructor_fixture_matches_real_version_parser() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else { return };
    let script = r"
const {createRequire}=require('node:module');
const {Version}=createRequire(process.argv[1]+'/package.json')('@teambit/objects');
const body={mainFile:'index.js',files:[],log:{},parents:[],dependencies:[{id:{scope:'test.scope',name:'dep',version:'1.0.0'},relativePaths:[]}],flattenedDependencies:[{scope:'test.scope',name:'dep',version:'1.0.0'}],extensions:[{extensionId:{scope:'test.scope',name:'aspect'},data:{}}]};
const parsed=Version.parse(JSON.stringify(body),'a'.repeat(40));
if(parsed.dependencies.get()[0].id.toString()!=='test.scope/dep@1.0.0')throw Error('dependency parser mismatch');
const bad=structuredClone(body);bad.dependencies[0].id.scope=null;let failed=false;try{Version.parse(JSON.stringify(bad),'a'.repeat(40))}catch{failed=true}if(!failed)throw Error('missing dependency scope accepted');
";
    let output = std::process::Command::new("node")
        .arg("-e")
        .arg(script)
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
}

#[test]
fn ordinary_dependency_graph_metadata_and_invalid_constructor_shapes() {
    let directory = Directory::new();
    let head = "a".repeat(40);
    let body = json!({"mainFile":"index.js","files":[],"log":{},"parents":[],"dependencies":[{"id":{"scope":"test.scope","name":"dep","version":"1.0.0"},"relativePaths":[]}],"flattenedDependencies":[{"scope":"test.scope","name":"dep","version":"1.0.0"}],"extensions":[{"extensionId":{"scope":"test.scope","name":"aspect"},"data":{}}]});
    directory.store("Version", &head, serde_json::to_string(&body).unwrap().as_bytes());
    assert_eq!(response(&graph(&directory, &head))["failed"], false);
    for field in ["scope", "name", "version"] {
        let mut bad = body.clone();
        bad["dependencies"][0]["id"][field] = json!({});
        directory.store("Version", &head, serde_json::to_string(&bad).unwrap().as_bytes());
        assert_eq!(response(&graph(&directory, &head))["failed"], true);
    }
    for extensions in [
        json!([{"extensionId":{"scope":null,"name":"aspect"}}]),
        json!([{"name":"teambit.pipelines/builder","data":{"artifacts":[{"files":{}}]}}]),
    ] {
        let mut bad = body.clone();
        bad["extensions"] = extensions;
        directory.store("Version", &head, serde_json::to_string(&bad).unwrap().as_bytes());
        assert_eq!(response(&graph(&directory, &head))["failed"], true);
    }
}

#[test]
fn malformed_version_metadata_declines_before_graph_output() {
    let directory = Directory::new();
    let head = "a".repeat(40);
    for body in [
        json!({"parents":[]}),
        json!({"mainFile":"index.js","files":[],"log":null,"parents":[]}),
        json!({"mainFile":"index.js","files":[],"log":{},"dependencies":{},"parents":[]}),
        json!({"mainFile":"index.js","files":[{"file":null}],"log":{},"parents":[]}),
    ] {
        directory.store("Version", &head, serde_json::to_string(&body).unwrap().as_bytes());
        let result = response(&graph(&directory, &head));
        assert_eq!(result["failed"], true);
        assert!(result.get("data").is_none());
    }
}

#[test]
fn dedicated_graph_reader_validates_built_artifacts_without_loading_artifact_sources() {
    let directory = Directory::new();
    let head = "e".repeat(40);
    let parent = "d".repeat(40);
    directory.version(&parent, &[]);
    let body = json!({"mainFile":"index.js","files":[],"parents":[parent],"log":{},"extensions":[{"name":"teambit.pipelines/builder","data":{"artifacts":[{"files":[{"relativePath":"dist/index.js","file":"f".repeat(40),"url":"https://example.test/index.js"}]}]}}]});
    directory.store("Version", &head, &serde_json::to_vec(&body).unwrap());
    let loaded = response(&graph(&directory, &head));
    assert_eq!(loaded["failed"], false);
    assert_eq!(loaded["data"]["added"], json!([record(&head, &[&parent]), record(&parent, &[])]));
    assert!(
        crate::read_version::Reader::new(&directory.0)
            .unwrap()
            .read(&head)
            .is_err(),
    );
    assert!(
        crate::read_version::Reader::history_with_artifacts(&directory.0)
            .unwrap()
            .metadata()
            .is_none(),
    );
    for file in [
        json!({"relativePath":"dist/index.js","file":null}),
        json!({"relativePath":false,"file":"f".repeat(40)}),
        json!({"relativePath":"dist/index.js","file":"f".repeat(40),"url":0}),
    ] {
        let mut invalid = body.clone();
        invalid["extensions"][0]["data"]["artifacts"][0]["files"] = json!([file]);
        directory.store("Version", &head, &serde_json::to_vec(&invalid).unwrap());
        let declined = response(&graph(&directory, &head));
        assert_eq!(declined["failed"], true);
        assert!(declined["data"].is_null());
    }
}
#[test]
fn actual_version_parser_hydrates_ordinary_artifact_refs() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else { return };
    let script = r"
const {createRequire}=require('node:module');
const {Version}=createRequire(process.argv[1]+'/package.json')('@teambit/objects');
const hash='f'.repeat(40);
const body={mainFile:'index.js',files:[],log:{},parents:[],extensions:[{name:'teambit.pipelines/builder',data:{artifacts:[{files:[{relativePath:'dist/index.js',file:hash,url:'https://example.test/index.js'}]}]}}]};
const version=Version.parse(JSON.stringify(body),'e'.repeat(40));
const files=version.extensions[0].data.artifacts[0].files;
if(files.refs[0].ref.toString()!==hash||files.refs[0].relativePath!=='dist/index.js')throw Error('artifact constructor mismatch');
";
    let output = std::process::Command::new("node")
        .arg("-e")
        .arg(script)
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
}

#[test]
fn indexed_history_preserves_deep_order_and_overlay_stop_boundaries() {
    let directory = Directory::new();
    let hashes: Vec<_> = (0..2048)
        .map(|index| format!("{index:040x}"))
        .collect();
    let cached: Vec<_> = hashes
        .iter()
        .enumerate()
        .map(|(index, hash)| {
            let parents: Vec<_> = hashes
                .get(index + 1)
                .map(String::as_str)
                .into_iter()
                .collect();
            record(hash, &parents)
        })
        .collect();
    let mut request = graph(&directory, &hashes[0]);
    request["cached"] = json!(cached);
    request["overlay"] = json!([record(&hashes[1024], &[&hashes[2047]])]);
    request["stopAt"] = json!([hashes[2047]]);
    let result = response(&request);
    assert_eq!(result["failed"], false);
    assert_eq!(result["data"]["added"], json!([]));
    assert_eq!(result["data"]["hashes"], json!(hashes[..1025]));
    let versions = result["data"]["versions"].as_array().unwrap();
    assert_eq!(versions.len(), hashes.len());
    assert_eq!(versions[1024], record(&hashes[1024], &[&hashes[2047]]));
    assert_eq!(versions[2047]["hash"], hashes[2047]);
}
