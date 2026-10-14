use super::{super::PENDING_GRAPH_VERSION, Budget, capture, digest, rekey};
use rayon::ThreadPoolBuilder;
use serde_json::json;
use std::fs;

#[test]
fn parallel_sources_preserve_order_hashes_and_share_one_allocation_budget() {
    let directory = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let files = (0..40)
        .map(|index| {
            let path = directory.0.join(index.to_string());
            fs::write(&path, b"\xef\xbb\xbfvalue\r\n").unwrap();
            json!({"relativePath":format!("{index}.js"),"source":{
            "spoolPath":path,"spoolHash":digest(b"\xef\xbb\xbfvalue\r\n")}})
        })
        .collect::<Vec<_>>();
    let version = json!({"files":[{"relativePath":"3.js","test":true}]});
    let serial = ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .unwrap();
    let parallel = ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    let expected = serial
        .install(|| capture(&version, &files, &Budget::new(400)))
        .unwrap();
    let actual = parallel
        .install(|| capture(&version, &files, &Budget::new(400)))
        .unwrap();
    assert_eq!(actual, expected);
    assert_eq!(actual[3].0["test"], true);
    assert_eq!(actual[3].0["file"], digest(b"value\n"));
    assert!(
        parallel
            .install(|| capture(&version, &files, &Budget::new(399)))
            .is_err(),
    );
    fs::write(directory.0.join("4"), b"changed").unwrap();
    assert!(
        parallel
            .install(|| capture(&version, &files, &Budget::new(400)))
            .is_err(),
    );
}

#[test]
fn pending_root_replacement_keeps_reachable_historical_root_distinct() {
    let pending = json!({"scope":"scope","name":"a","version":PENDING_GRAPH_VERSION});
    let old = json!({"scope":"scope","name":"a","version":"old"});
    let dependency = json!({"scope":"scope","name":"b","version":"b"});
    let mut rows = vec![
        json!({"source":pending,"target":dependency,"type":"prod"}),
        json!({"source":dependency,"target":old,"type":"prod"}),
        json!({"source":old,"target":dependency,"type":"prod"}),
    ];
    rekey(&mut rows, "scope/a", "new");
    assert_eq!(rows[0]["source"]["version"], "new");
    assert_eq!(rows[1]["target"], old);
    assert_eq!(rows[2]["source"], old);
}

#[test]
fn dependencies_graph_is_stored_as_a_source_the_version_refers_to() {
    let graph = r#"{"schemaVersion":"2.0","packages":{},"edges":[{"id":".","neighbours":[]}]}"#;
    let mut version = serde_json::json!({"files":[]});
    let mut objects = Vec::new();
    super::dependencies_graph(
        &serde_json::json!({"identity":"s/a","hash":"h"}),
        &mut version,
        &mut objects,
    )
    .unwrap();
    assert!(version.get("dependenciesGraphRef").is_none() && objects.is_empty());
    let allocation = serde_json::json!({"identity":"s/a","hash":"h","dependenciesGraph":graph});
    super::dependencies_graph(&allocation, &mut version, &mut objects).unwrap();
    let hash = super::digest(graph.as_bytes());
    assert_eq!(version["dependenciesGraphRef"], hash);
    assert_eq!(objects[0]["hash"], hash);
    assert_eq!(objects[0]["type"], "Source");
    let invalid = serde_json::json!({"identity":"s/a","hash":"h","dependenciesGraph":1});
    assert!(super::dependencies_graph(&invalid, &mut version, &mut objects).is_err());
}
