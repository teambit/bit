use std::{fs, io::Write};

use flate2::{Compression, write::ZlibEncoder};
use serde_json::json;

use super::{Mode, Version, select};
use crate::transfer::{
    prepare,
    tests::{directory, source},
};

fn version(root: &std::path::Path, hash: [u8; 20], sources: &[[u8; 20]], artifacts: &[[u8; 20]]) {
    let text = crate::validate::hexadecimal(&hash);
    let body = json!({"mainFile":"index.js","log":{},"files":sources.iter().map(|hash| json!({"file":crate::validate::hexadecimal(hash)})).collect::<Vec<_>>(),"extensions":[{"name":"teambit.pipelines/builder","data":{"artifacts":[{"files":artifacts.iter().map(|hash| json!({"file":crate::validate::hexadecimal(hash),"relativePath":"a"})).collect::<Vec<_>>()}]}}]}).to_string();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "Version {text} {}\0{body}", body.len()).unwrap();
    fs::create_dir_all(root.join(&text[..2])).unwrap();
    fs::write(root.join(&text[..2]).join(&text[2..]), encoder.finish().unwrap()).unwrap();
}

#[test]
fn export_groups_and_fetch_version_last_preserve_exact_order() {
    let root = directory();
    let (one, _) = source(&root, b"one");
    let (two, _) = source(&root, b"two");
    let (artifact, _) = source(&root, b"artifact");
    version(&root, [1; 20], &[one], &[artifact]);
    version(&root, [2; 20], &[two], &[artifact]);
    let versions = [
        Version { hash: [1; 20], locally_changed: false, expected: None },
        Version { hash: [2; 20], locally_changed: true, expected: None },
    ];
    let export =
        select(&root, &versions, None, 0, &Mode::Export { strict_local_artifacts: true }).unwrap();
    assert_eq!(
        export
            .iter()
            .map(|item| item.hash)
            .collect::<Vec<_>>(),
        vec![[1; 20], [2; 20], one, two, artifact, artifact],
    );
    let fetch =
        select(&root, &versions, None, 0, &Mode::Fetch { include_artifacts: true }).unwrap();
    assert_eq!(
        fetch
            .iter()
            .map(|item| item.hash)
            .collect::<Vec<_>>(),
        vec![one, artifact, [1; 20], two, [2; 20]],
    );
    assert_eq!(prepare(&root, &root.join("export.tar"), export).unwrap().count, 5);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn missing_local_artifacts_strict_and_old_artifacts_optional() {
    let root = directory();
    let (source, _) = source(&root, b"one");
    version(&root, [1; 20], &[source], &[[9; 20]]);
    let mut versions = [Version { hash: [1; 20], locally_changed: true, expected: None }];
    assert!(
        select(&root, &versions, None, 0, &Mode::Export { strict_local_artifacts: true }).is_err(),
    );
    assert_eq!(
        select(&root, &versions, None, 0, &Mode::Export { strict_local_artifacts: false })
            .unwrap()
            .len(),
        2,
    );
    versions[0].locally_changed = false;
    assert_eq!(
        select(&root, &versions, None, 0, &Mode::Export { strict_local_artifacts: true })
            .unwrap()
            .len(),
        2,
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn stale_cached_refs_or_missing_required_source_never_creates_archive() {
    let root = directory();
    version(&root, [1; 20], &[[9; 20]], &[]);
    let versions = [Version { hash: [1; 20], locally_changed: true, expected: None }];
    let selected =
        select(&root, &versions, None, 0, &Mode::Export { strict_local_artifacts: true }).unwrap();
    let archive = root.join("transfer.tar");
    assert!(prepare(&root, &archive, selected).is_err());
    assert!(!archive.exists());
    let mut stale = Version { hash: [1; 20], locally_changed: true, expected: None };
    stale.expected =
        Some(super::References { sources: vec![], artifacts: vec![], edges: None, graph: None });
    assert!(select(&root, &[stale], None, 0, &Mode::Fetch { include_artifacts: false }).is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn ordinary_dependency_and_extension_identity_metadata_is_eligible() {
    let value = json!({"mainFile":"a","log":{},"files":[],"dependencies":[{"id":{"scope":"test.scope","name":"dep","version":"1.0.0"},"relativePaths":[{"importSpecifiers":[{"mainFile":{"name":"a"}}]}]}],"flattenedDependencies":[{"scope":"test.scope","name":"dep"}],"extensions":[{"extensionId":{"scope":"test.scope","name":"aspect","version":"1.0.0"},"data":{}}]});
    assert!(super::shape::eligible(&value).is_ok());
    let mut bad = value;
    bad["dependencies"][0]["id"]["scope"] = json!(null);
    assert!(super::shape::eligible(&bad).is_err());
}
