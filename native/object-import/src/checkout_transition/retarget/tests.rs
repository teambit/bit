use super::{additions, plan, statuses, wire};
use serde_json::json;
use std::path::{Path, PathBuf};
fn retained_plan() -> plan::Plan {
    plan::Plan {
        bodies: vec![plan::Body::new(b"retained".to_vec()), plan::Body::new(b"retained".to_vec())],
        target: Vec::new(),
        target_indices: Vec::new(),
        current: Vec::new(),
        merge_rows: Vec::new(),
        has_conflicts: false,
        statuses: Vec::new(),
        other: None,
    }
}
fn current(hash: &str) -> plan::Current {
    plan::Current {
        relative_path: "a".to_owned(),
        path: PathBuf::new(),
        protected: false,
        plan_index: 0,
        shares_buffer: false,
        raw_hash: hash.to_owned(),
    }
}
fn target(path: &str, hash: &str) -> wire::Manifest {
    wire::Manifest { hash: hash.to_owned(), relative_path: path.to_owned(), name: None, test: None }
}
#[test]
fn retained_duplicates_select_first_body_and_new_occurrences_keep_separate_indices() {
    let plan = retained_plan();
    let (indices, added) = additions(
        &plan,
        [b"retained".as_slice(), b"new", b"new", b"retained"].map(<[u8]>::to_vec).to_vec(),
        Path::new("private"),
        "owner",
    );
    assert_eq!(indices, vec![0, 2, 3, 0]);
    assert_eq!(added.len(), 2);
    assert_eq!(added[0].path, Path::new("private").join("owner-2.checkout"));
    assert_eq!(added[1].path, Path::new("private").join("owner-3.checkout"));
    assert_eq!(added[0].contents, added[1].contents);
}
#[test]
fn status_lookup_keeps_first_current_path_and_target_order() {
    let mut plan = retained_plan();
    plan.current = vec![current("first"), current("second")];
    assert_eq!(
        statuses(&plan, &[target("a", "second"), target("a", "first"), target("missing", "first")]),
        vec![
            json!({"relativePath":"a","status":"updated"}),
            json!({"relativePath":"a","status":"unchanged"}),
            json!({"relativePath":"missing","status":"updated"}),
        ],
    );
}

#[test]
fn imported_retarget_verifies_private_manifest_even_when_sources_are_retained() {
    use flate2::{Compression, write::ZlibEncoder};
    use std::io::Write;
    let plan = retained_plan();
    let hash = plan.bodies[0].hash.clone();
    let reference = "b".repeat(40);
    let version = json!({"files":[{"relativePath":"a","file":hash}]});
    let serialized = serde_json::to_vec(&version).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "Version {reference} {}\0", serialized.len()).unwrap();
    encoder.write_all(&serialized).unwrap();
    let overlay = crate::command_import::tests::test_overlay(vec![(
        reference.clone(),
        "Version".into(),
        encoder.finish().unwrap(),
        Some(version),
    )]);
    let mut request = super::Request {
        token: "unused".into(),
        objects_directory: std::env::temp_dir().join("no-published-lane-objects"),
        snapshot_directory: std::env::temp_dir(),
        target: wire::Version {
            hash: reference,
            files: vec![target("a", &hash)],
            proof_files: None,
        },
        known_bodies: Some(plan.bodies.len()),
    };
    assert_eq!(
        super::load(&request, 0, &plan, Some(&overlay)).unwrap(),
        vec![b"retained".to_vec()],
    );
    request.target.files[0].relative_path = "tampered".into();
    assert!(super::load(&request, 0, &plan, Some(&overlay)).is_err());
}
