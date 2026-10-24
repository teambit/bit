use super::{Repository, project};
use crate::workspace::engine::command::{policy::Row, scratch};
use serde_json::{Value, json};
use std::{fs, io::Write, path::Path};

fn store(root: &Path, hash: &str, value: &Value) {
    let bytes = serde_json::to_vec(value).unwrap();
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    encoder
        .write_all(format!("Version {hash} {}\0", bytes.len()).as_bytes())
        .unwrap();
    encoder.write_all(&bytes).unwrap();
    let file = root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(file, encoder.finish().unwrap()).unwrap();
}

#[test]
fn changed_lifecycles_and_deleted_imports_rebuild_depth_first_edges_with_repository_proofs() {
    let directory = scratch::Directory::create().unwrap();
    let first = json!({"scope":"scope","name":"b","version":"b".repeat(40)});
    let second = json!({"scope":"scope","name":"c","version":"c".repeat(40)});
    store(
        &directory.0,
        &"b".repeat(40),
        &json!({"schema":"2.0.0","dependencies":[{"id":second,"relativePaths":[]}],"devDependencies":[],"extensions":[]}),
    );
    store(
        &directory.0,
        &"c".repeat(40),
        &json!({"schema":"2.0.0","dependencies":[],"devDependencies":[],"extensions":[]}),
    );
    let mut row = Row {
        identity: "scope/a".into(),
        baseline: crate::workspace::engine::command::policy::Baseline {
            directory: "a".into(),
            version: "1.0.0".into(),
            current: Value::Null,
            versions: [Value::Null, Value::Null, Value::Null],
            package_name: "@scope/a".into(),
            scope_only: false,
        },
        files: vec![],
        merged: json!({}),
        projected: json!({"dependencies":[],"devDependencies":[{"id":first,"relativePaths":[]}],"extensions":[],
            "flattenedDependencies":[{"scope":"scope","name":"removed","version":"old"}],"flattenedEdgesRef":"obsolete"}),
        ours_conflict: false,
        fast_forward: false,
        receipts: super::super::Receipts::default(),
    };
    let mut repository = Repository::new(&directory.0, None);
    project(&mut row, &mut repository).unwrap();
    assert_eq!(row.projected["flattenedDependencies"], json!([first, second]));
    assert_eq!(row.projected["flattenedEdges"][0]["type"], "dev");
    assert_eq!(row.projected["flattenedEdges"][1]["type"], "prod");
    assert!(row.projected.get("flattenedEdgesRef").is_none());
    repository.validate().unwrap();
    row.projected["devDependencies"] = json!([]);
    project(&mut row, &mut repository).unwrap();
    assert_eq!(row.projected["flattenedDependencies"], json!([]));
    assert_eq!(row.projected["flattenedEdges"], json!([]));
    // ClearGraph successorsSubgraph starts from the NEW snap node. The historical
    // root reached through a dependency is a separate node, including its edges.
    let old_root = json!({"scope":"scope","name":"a","version":"a".repeat(40)});
    store(
        &directory.0,
        &"a".repeat(40),
        &json!({"schema":"2.0.0",
        "dependencies":[{"id":first,"relativePaths":[]}],"devDependencies":[],"extensions":[]}),
    );
    store(
        &directory.0,
        &"b".repeat(40),
        &json!({"schema":"2.0.0",
        "dependencies":[{"id":old_root,"relativePaths":[]}],"devDependencies":[],"extensions":[]}),
    );
    row.baseline.version = "a".repeat(40);
    row.projected["dependencies"] = json!([{"id":first,"relativePaths":[]}]);
    let mut repository = Repository::new(&directory.0, None);
    project(&mut row, &mut repository).unwrap();
    assert_eq!(row.projected["flattenedDependencies"], json!([first, old_root]));
    assert_eq!(
        row.projected["flattenedEdges"][0]["source"]["version"],
        crate::workspace::engine::command::merge::snapshot::PENDING_GRAPH_VERSION,
    );
    assert_eq!(row.projected["flattenedEdges"][1]["target"], old_root);
    assert_eq!(row.projected["flattenedEdges"][2]["source"], old_root);
    fs::write(
        directory.0
            .join(".bit/objects/bb")
            .join("b".repeat(38)),
        b"changed",
    )
    .unwrap();
    assert!(repository.validate().is_err());
}

#[test]
fn saved_diamond_graph_requires_exact_canonical_adjacency_order_and_lifecycle() {
    let directory = scratch::Directory::create().unwrap();
    let ids: Vec<_> = ["a", "b", "c", "d"]
        .iter()
        .map(|name| json!({"scope":"scope","name":name,"version":name.repeat(40)}))
        .collect();
    for (index, targets) in [vec![1, 2], vec![3], vec![3], vec![]].iter().enumerate() {
        store(
            &directory.0,
            ids[index]["version"].as_str().unwrap(),
            &json!({
            "schema":"2.0.0","dependencies":targets.iter().map(|target| json!({"id":ids[*target],"relativePaths":[]})).collect::<Vec<_>>(),
            "devDependencies":[],"extensions":[]}),
        );
    }
    let edge = |source: usize, target: usize| json!({"source":ids[source],"target":ids[target],"type":"prod"});
    let mut version = json!({"flattenedEdges":[edge(0,1),edge(1,3),edge(0,2),edge(2,3)]});
    let mut repository = Repository::new(&directory.0, None);
    super::previous::validate(&version, &mut repository).unwrap();
    // ClearGraph uses insertion order for a source's successors: this changes
    // its DFS from a,b,d,c to a,c,d,b despite identical dependency membership.
    version["flattenedEdges"]
        .as_array_mut()
        .unwrap()
        .swap(0, 2);
    assert!(super::previous::validate(&version, &mut repository).is_err());
    version["flattenedEdges"]
        .as_array_mut()
        .unwrap()
        .swap(0, 2);
    version["flattenedEdges"][1]["type"] = json!("dev");
    assert!(super::previous::validate(&version, &mut repository).is_err());
}
