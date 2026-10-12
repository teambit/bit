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
