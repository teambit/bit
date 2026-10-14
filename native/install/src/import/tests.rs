use super::{
    bitmap,
    component::{keep_existing_version, merge_component, merge_version_history},
    fetch::FetchOptions,
    http::{Network, Retry},
    import_current_objects,
    objects::{Repo, component_hash, compress_json, parse, sha1_hex, version_history_hash},
    remotes::{Remote, symphony_url},
    tar::{self, ObjectItem},
};
use crate::{
    host::HostInfo,
    model::GlobalConfig,
    output::{Output, Sink},
};
use serde_json::{Value, json};
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tempfile::TempDir;

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

fn write(repo: &Repo, kind: &str, hash: &str, value: &Value) {
    repo.write_raw(hash, &compress_json(kind, hash, value).unwrap())
        .unwrap();
}

/// A dependency as written in `flattenedDependencies`.
struct Dependency<'a> {
    name: &'a str,
    version: &'a str,
}

/// Tag `remote/<name>@0.0.1` in `repo` and return the Version hash.
fn tag(repo: &Repo, name: &str, dependencies: &[Dependency<'_>], graph: bool) -> String {
    let contents = format!("export const {name} = 1;");
    let file = sha1_hex(&contents);
    repo.write_raw(&file, &super::objects::compress("Source", &file, contents.as_bytes()).unwrap())
        .unwrap();
    let flattened: Vec<Value> = dependencies
        .iter()
        .map(|dep| json!({ "scope": "remote", "name": dep.name, "version": dep.version }))
        .collect();
    let mut version = json!({
        "files": [{ "file": file, "relativePath": "index.ts", "name": "index.ts", "test": false }],
        "mainFile": "index.ts",
        "log": { "date": "1700000000000" },
        "flattenedDependencies": flattened,
        "buildStatus": "succeed",
        "modified": [],
    });
    if graph {
        let edges = json!([{ "source": { "scope": "remote", "name": name }, "target": flattened[0], "type": "prod" }]);
        let edges_hash = sha1_hex(&edges.to_string());
        write(repo, "Source", &edges_hash, &edges);
        version["flattenedEdgesRef"] = json!(edges_hash);
    }
    let hash = sha1_hex(&format!("{name}-version-{graph}"));
    write(repo, "Version", &hash, &version);
    let component = json!({
        "name": name, "scope": "remote", "versions": { "0.0.1": hash }, "lang": "javascript",
        "deprecated": false, "bindingPrefix": "@remote", "remotes": [], "schema": "2.0.0", "head": hash,
    });
    write(repo, "Component", &component_hash("remote", name), &component);
    let history = json!({ "name": name, "scope": "remote", "versions": [{ "hash": hash, "parents": [] }], "graphCompleteRefs": [] });
    write(repo, "VersionHistory", &version_history_hash("remote", name), &history);
    hash
}

struct Fixture {
    _dir: TempDir,
    root: PathBuf,
    scope_dir: PathBuf,
    config_dir: PathBuf,
}

/// A bare `remote` scope and a workspace tracking `bitmap_ids` from it.
fn fixture(graph: bool, bitmap_ids: &[&str]) -> (Fixture, String) {
    let dir = TempDir::new().unwrap();
    let remote = dir.path().join("remote");
    fs::create_dir_all(&remote).unwrap();
    fs::write(remote.join("scope.json"), r#"{ "name": "remote" }"#).unwrap();
    let remote_repo = Repo::new(&remote);
    tag(&remote_repo, "comp2", &[], false);
    let comp1 =
        tag(&remote_repo, "comp1", &[Dependency { name: "comp2", version: "0.0.1" }], graph);
    let root = dir.path().join("ws");
    let scope_dir = root.join(".bit");
    fs::create_dir_all(&scope_dir).unwrap();
    let scope_json = json!({ "name": "ws-local", "remotes": { "remote": format!("file://{}", remote.display()) } });
    fs::write(scope_dir.join("scope.json"), scope_json.to_string()).unwrap();
    let entries: Vec<String> = bitmap_ids
        .iter()
        .map(|name| format!(r#""{name}": {{ "name": "{name}", "scope": "remote", "version": "0.0.1", "mainFile": "index.ts", "rootDir": "{name}" }}"#))
        .collect();
    let bitmap = format!(
        "/* generated */\n{{\n{},\n\"$schema-version\": \"17.0.0\"\n}}",
        entries.join(",\n"),
    );
    fs::write(root.join(".bitmap"), bitmap).unwrap();
    let config_dir = dir.path().join("global");
    fs::create_dir_all(&config_dir).unwrap();
    (Fixture { _dir: dir, root, scope_dir, config_dir }, comp1)
}

fn recorder() -> (Sink, Arc<Mutex<String>>) {
    let written = Arc::new(Mutex::new(String::new()));
    let target = Arc::clone(&written);
    (Arc::new(move |text: &str| target.lock().unwrap().push_str(text)), written)
}

fn run_import(fixture: &Fixture) -> (super::ImportSummary, String) {
    let info = HostInfo {
        global_config_dir: fixture.config_dir.clone(),
        bit_version: "1.0.0".into(),
        ..HostInfo::default()
    };
    let (sink, written) = recorder();
    let output = Output::new(false, false, true, sink);
    let summary = runtime()
        .block_on(import_current_objects(
            &fixture.root,
            &fixture.scope_dir,
            &GlobalConfig::default(),
            &info,
            &output,
        ))
        .unwrap();
    let text = written.lock().unwrap().clone();
    (summary, text)
}

#[test]
fn objects_round_trip_with_bit_hashes() {
    assert_eq!(component_hash("remote", "comp1"), "df3d07bbeeb5fb50de147c262ffa873ada94c192");
    assert_eq!(version_history_hash("remote", "comp1"), "4b57c0a367002bbb6f48170706d01eb8177a9571");
    assert_eq!(sha1_hex("remote"), "41ffe5457d1a557c3317f2e5216ceaa355223d39");
    let compressed = compress_json(
        "ScopeMeta",
        "41ffe5457d1a557c3317f2e5216ceaa355223d39",
        &json!({ "name": "remote" }),
    )
    .unwrap();
    let parsed = parse(&compressed).unwrap();
    assert_eq!(parsed.kind, "ScopeMeta");
    assert_eq!(parsed.content, br#"{"name":"remote"}"#);
}

#[test]
fn tar_round_trips_and_reports_server_errors() {
    let hash = sha1_hex("x");
    let items =
        vec![ObjectItem { hash, compressed: b"abc".to_vec(), scope: Some("remote".into()) }];
    let bytes = tar_write(&items, "remote").unwrap();
    assert_eq!(tar::read(&bytes).unwrap(), items);
    let mut builder = ::tar::Builder::new(Vec::new());
    let mut header = ::tar::Header::new_ustar();
    header.set_size(4);
    header.set_cksum();
    builder
        .append_data(&mut header, ".BIT.ERROR", &b"boom"[..])
        .unwrap();
    assert_eq!(tar::read(&builder.into_inner().unwrap()).unwrap_err().to_string(), "boom");
}

#[test]
fn truncated_streams_are_rejected() {
    let bytes = tar_write(&[], "remote").unwrap();
    let mut builder = ::tar::Builder::new(Vec::new());
    for entry in ::tar::Archive::new(&bytes[..]).entries().unwrap() {
        let mut entry = entry.unwrap();
        if entry.path().unwrap().to_string_lossy() == ".BIT.START" {
            let mut data = Vec::new();
            entry.read_to_end(&mut data).unwrap();
            let mut header = entry.header().clone();
            builder
                .append_data(&mut header, ".BIT.START", &data[..])
                .unwrap();
        }
    }
    let error = tar::read(&builder.into_inner().unwrap()).unwrap_err();
    assert!(error.to_string().starts_with("server terminated the stream unexpectedly"));
}

#[test]
fn reads_exported_bitmap_ids_and_lane() {
    let dir = TempDir::new().unwrap();
    let bitmap = r#"/* comment */
{
    "a": { "name": "a", "scope": "s", "version": "0.0.2", "rootDir": "a" },
    "new": { "name": "new", "scope": "", "version": "", "defaultScope": "s", "rootDir": "new" },
    "b": { "name": "b/c", "scope": "s", "version": "0.0.1", "rootDir": "b", "isAvailableOnCurrentLane": false },
    "_bit_lane": { "id": { "name": "dev", "scope": "s" }, "exported": true },
    "$schema-version": "17.0.0",
}"#;
    fs::write(dir.path().join(".bitmap"), bitmap).unwrap();
    let read = bitmap::read(dir.path()).unwrap();
    let names: Vec<_> = read.ids
        .iter()
        .map(super::Id::to_request)
        .collect();
    assert_eq!(names, ["s/a@0.0.2", "s/b/c@0.0.1"]);
    assert_eq!(read.current_lane_ids.len(), 1);
    assert_eq!(read.lane.unwrap().to_request(), "s/dev");
    assert_eq!(super::Id::parse("s/b/c@1.0.0").unwrap().name, "b/c");
}

#[test]
fn imports_bitmap_versions_with_dependencies_from_a_file_remote() {
    let (fixture, comp1) = fixture(false, &["comp1"]);
    let (summary, output) = run_import(&fixture);
    let repo = Repo::new(&fixture.scope_dir);
    assert!(repo.exists(&comp1));
    assert!(
        repo.exists(&component_hash("remote", "comp2")),
        "flattened dependency without a graph",
    );
    assert!(repo.exists(&sha1_hex("remote")), "ScopeMeta");
    assert_eq!(summary.components, 2);
    let index: Value =
        serde_json::from_slice(&fs::read(fixture.scope_dir.join("index.json")).unwrap()).unwrap();
    assert_eq!(index["components"][0]["id"], json!({ "scope": "remote", "name": "comp1" }));
    let refs: Value = serde_json::from_slice(
        &fs::read(fixture.scope_dir.join("refs/remotes/remote/main")).unwrap(),
    )
    .unwrap();
    assert_eq!(refs[0], json!({ "id": { "scope": "remote", "name": "comp1" }, "head": comp1 }));
    assert!(output.starts_with(
        "- importing missing objects\n- importing components\n✔ importing components (completed in "
    ));
    let (again, _) = run_import(&fixture);
    assert_eq!(again.objects, 0, "an up-to-date workspace fetches nothing new");
}

#[test]
fn a_dependency_graph_avoids_fetching_dependencies() {
    let (fixture, comp1) = fixture(true, &["comp1"]);
    run_import(&fixture);
    let repo = Repo::new(&fixture.scope_dir);
    assert!(repo.exists(&comp1));
    assert!(!repo.exists(&component_hash("remote", "comp2")));
}

#[test]
fn a_missing_remote_scope_is_skipped() {
    let (fixture, _) = fixture(false, &["comp1"]);
    let scope_json =
        json!({ "name": "ws-local", "remotes": { "remote": "file:///nonexistent/scope" } });
    fs::write(fixture.scope_dir.join("scope.json"), scope_json.to_string()).unwrap();
    let (summary, _) = run_import(&fixture);
    assert_eq!(summary.components, 0);
}

fn component(versions: &Value, head: &str, state: Option<Value>) -> Value {
    let mut component = json!({ "name": "c", "scope": "s", "versions": versions, "lang": "javascript", "remotes": [], "schema": "2.0.0", "head": head });
    if let Some(state) = state {
        component["state"] = state;
    }
    component
}

#[test]
fn merges_incoming_tags_and_moves_the_head() {
    let first = "a".repeat(40);
    let second = "b".repeat(40);
    let existing = component(&json!({ "0.0.1": first }), &first, None);
    let incoming = component(&json!({ "0.0.1": first, "0.0.2": second }), &second, None);
    let merged = merge_component(Some(&existing), &incoming, true).unwrap();
    assert_eq!(merged["versions"], json!({ "0.0.1": first, "0.0.2": second }));
    assert_eq!(merged["head"], json!(second));
    let keys: Vec<_> = merged
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    assert_eq!(keys, ["name", "scope", "versions", "lang", "remotes", "schema", "head"]);
}

#[test]
fn non_origin_tags_become_orphaned_and_local_heads_stay() {
    let first = "a".repeat(40);
    let second = "b".repeat(40);
    let state = json!({ "versions": { "0.0.1": { "local": true } } });
    let existing = component(&json!({ "0.0.1": first }), &first, Some(state));
    let incoming = component(&json!({ "0.0.2": second }), &second, None);
    let merged = merge_component(Some(&existing), &incoming, false).unwrap();
    assert_eq!(merged["orphanedVersions"], json!({ "0.0.2": second }));
    assert_eq!(merged["head"], json!(first));
    let conflicting = component(&json!({ "0.0.1": second }), &second, None);
    let error = merge_component(Some(&existing), &conflicting, true).unwrap_err();
    assert!(
        error
            .to_string()
            .starts_with("error: versions conflict occurred while importing the component s/c."),
    );
}

#[test]
fn merges_version_histories_and_keeps_newer_versions() {
    let existing = json!({ "name": "c", "versions": [{ "hash": "1" }, { "hash": "2" }], "graphCompleteRefs": ["1"] });
    let incoming = json!({ "name": "c", "versions": [{ "hash": "3" }, { "hash": "1" }] });
    let merged = merge_version_history(&existing, &incoming);
    assert_eq!(merged["versions"], json!([{ "hash": "3" }, { "hash": "1" }, { "hash": "2" }]));
    assert_eq!(merged["graphCompleteRefs"], json!(["1"]));
    let newer = json!({ "log": { "date": "1" }, "modified": [{ "date": "9" }] });
    let older = json!({ "log": { "date": "5" } });
    assert!(keep_existing_version(&newer, &older));
    assert!(!keep_existing_version(&older, &newer));
}

#[test]
fn resolves_remote_protocols_and_symphony() {
    assert_eq!(Remote::from_host("file:///a/b").unwrap(), Remote::File(PathBuf::from("/a/b")));
    assert_eq!(Remote::from_host("https://x.io/").unwrap(), Remote::Http("https://x.io".into()));
    assert!(Remote::from_host("ssh://x").is_err());
    assert_eq!(symphony_url(&GlobalConfig::default()), "https://api.v2.bit.cloud");
    let global: GlobalConfig =
        std::iter::once(("cloud_domain".to_string(), json!("example.com"))).collect();
    assert_eq!(symphony_url(&global), "https://api.example.com");
    let retry = Retry { retries: 5, factor: 10, min_timeout: 1000, max_timeout: 60_000 };
    assert_eq!(retry.delay(0), Duration::from_secs(1));
    assert_eq!(retry.delay(2), Duration::from_mins(1));
}

/// Serve one HTTP request and return what the client sent.
fn serve_once(status: &'static str, body: Vec<u8>) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_request(&mut stream);
        let head = format!(
            "HTTP/1.1 {status}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
            body.len(),
        );
        stream.write_all(head.as_bytes()).unwrap();
        stream.write_all(&body).unwrap();
        request
    });
    (url, handle)
}

fn read_request(stream: &mut std::net::TcpStream) -> String {
    let mut request = Vec::new();
    let mut buffer = [0; 4096];
    loop {
        let read = stream.read(&mut buffer).unwrap();
        request.extend_from_slice(&buffer[..read]);
        let text = String::from_utf8_lossy(&request).into_owned();
        let Some((head, body)) = text.split_once("\r\n\r\n") else { continue };
        let length = head
            .lines()
            .find_map(|line| {
                line.to_ascii_lowercase()
                    .strip_prefix("content-length: ")
                    .map(|n| n.trim().parse::<usize>().unwrap())
            })
            .unwrap_or(0);
        if body.len() >= length {
            return text;
        }
    }
}

#[test]
fn fetches_over_http_with_bit_headers() {
    let hash = sha1_hex("o");
    let items = vec![ObjectItem { hash, compressed: b"z".to_vec(), scope: None }];
    let (url, server) = serve_once("200 OK", tar_write(&items, "remote").unwrap());
    let global: GlobalConfig =
        std::iter::once(("user.token".to_string(), json!("secret"))).collect();
    let network = Network::new(&global, "1.2.3", Some("ws-local")).unwrap();
    let options = FetchOptions::latest(None, true);
    let fetched = runtime()
        .block_on(network.fetch(&url, &["remote/comp1".into()], &options))
        .unwrap();
    assert_eq!(fetched, items);
    let request = server.join().unwrap();
    assert!(request.starts_with("POST /api/scope/fetch HTTP/1.1"));
    for header in [
        "authorization: Bearer secret",
        "x-verb: read",
        "x-client-version: 1.2.3",
        "x-request-scope: ws-local",
    ] {
        assert!(
            request
                .to_ascii_lowercase()
                .contains(&header.to_ascii_lowercase()),
            "{header}",
        );
    }
    let body: Value = serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(body["ids"], json!(["remote/comp1"]));
    assert_eq!(body["fetchOptions"]["type"], "component");
    assert_eq!(body["fetchOptions"]["returnNothingIfGivenVersionExists"], true);
    assert_eq!(body["fetchOptions"]["fetchSchema"], "0.0.3");
}

#[test]
fn maps_http_errors_like_the_remote_error_handler() {
    let body = json!({ "error": { "code": 129, "name": "missing" } }).to_string().into_bytes();
    let (url, server) = serve_once("500 Internal Server Error", body);
    let network = Network::new(&GlobalConfig::default(), "1.0.0", None).unwrap();
    let error = runtime()
        .block_on(network.fetch(&url, &[], &FetchOptions::lanes()))
        .unwrap_err();
    server.join().unwrap();
    assert_eq!(error.to_string(), r#"error: remote scope "missing" was not found."#);
}

/// Compare with the canonical import of a real workspace: set
/// `BIT_IMPORT_PARITY_WORKSPACE` to a workspace whose `.bit` holds only
/// `scope.json`, and `BIT_IMPORT_PARITY_EXPECTED` to the `objects` dir the
/// TypeScript `bit import` produced for it.
#[test]
#[ignore = "needs a workspace prepared with the bit CLI"]
fn matches_the_canonical_import() {
    let root = PathBuf::from(std::env::var("BIT_IMPORT_PARITY_WORKSPACE").unwrap());
    let expected = PathBuf::from(std::env::var("BIT_IMPORT_PARITY_EXPECTED").unwrap());
    let fixture = Fixture {
        _dir: TempDir::new().unwrap(),
        scope_dir: root.join(".bit"),
        root,
        config_dir: home_config(),
    };
    run_import(&fixture);
    let actual = Repo::new(&fixture.scope_dir);
    for hash in object_hashes(&expected) {
        let expected = parse(
            &fs::read(
                expected
                    .join(&hash[..2])
                    .join(&hash[2..]),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(actual.read(&hash).unwrap().as_ref(), Some(&expected), "{hash}");
    }
}

fn home_config() -> PathBuf {
    PathBuf::from(std::env::var("BIT_IMPORT_PARITY_GLOBAL").unwrap_or_default())
}

fn object_hashes(dir: &Path) -> Vec<String> {
    let mut hashes = Vec::new();
    for prefix in fs::read_dir(dir).unwrap() {
        let prefix = prefix.unwrap();
        for object in fs::read_dir(prefix.path()).unwrap() {
            let name = object.unwrap().file_name();
            hashes.push(format!(
                "{}{}",
                prefix.file_name().to_string_lossy(),
                name.to_string_lossy(),
            ));
        }
    }
    hashes
}

/// Serialize objects the way a remote does.
fn tar_write(items: &[ObjectItem], scope_name: &str) -> std::io::Result<Vec<u8>> {
    let mut builder = ::tar::Builder::new(Vec::new());
    append(
        &mut builder,
        ".BIT.START",
        serde_json::json!({ "schema": "1.0.0", "scopeName": scope_name }).to_string().as_bytes(),
    )?;
    for item in items {
        let name = match &item.scope {
            Some(scope) => format!("{scope}/{}", item.hash),
            None => item.hash.clone(),
        };
        append(&mut builder, &name, &item.compressed)?;
    }
    let end = serde_json::json!({ "numOfFiles": items.len(), "scopeName": scope_name });
    append(&mut builder, ".BIT.END", end.to_string().as_bytes())?;
    builder.into_inner()
}

fn append(builder: &mut ::tar::Builder<Vec<u8>>, name: &str, data: &[u8]) -> std::io::Result<()> {
    let mut header = ::tar::Header::new_ustar();
    header.set_size(data.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    builder.append_data(&mut header, name, data)
}
