//! Repository deletion leaves the parent untouched when the object disappeared before unlink.
use super::super::{super::format::GcResult, Plan};
use std::fs;

#[test]
fn an_object_removed_after_planning_does_not_remove_its_empty_bucket() {
    let scope = tempfile::tempdir().unwrap();
    let bucket = scope.path().join("objects/ab");
    fs::create_dir_all(&bucket).unwrap();
    let plan = Plan {
        result: GcResult::default(),
        versions: Vec::new(),
        sources: vec![format!("ab{}", "0".repeat(38))],
        stray: Vec::new(),
    };
    plan.execute(scope.path()).unwrap();
    assert!(bucket.is_dir());
    assert!(
        fs::read_dir(bucket)
            .unwrap()
            .next()
            .is_none(),
    );
}

#[test]
fn mixed_type_reports_decline_before_stray_cleanup_or_collection() {
    let scope = tempfile::tempdir().unwrap();
    let stray = scope.path().join("interrupted-write");
    fs::write(&stray, b"keep until planning succeeds").unwrap();
    let mut result = GcResult::default();
    for kind in ["Version", "Source"] {
        result.deleted.by_type.insert(
            kind.into(),
            super::super::super::format::DeletedTypeStats { count: 1, size: 1 },
        );
    }
    let plan =
        Plan { result, versions: Vec::new(), sources: Vec::new(), stray: vec![stray.clone()] };
    assert!(
        plan.validate(scope.path())
            .unwrap_err()
            .to_string()
            .contains("mixed object-type"),
    );
    assert_eq!(fs::read(stray).unwrap(), b"keep until planning succeeds");
}
