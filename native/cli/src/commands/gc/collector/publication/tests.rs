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
