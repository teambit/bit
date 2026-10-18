use super::prepare;
use serde_json::Map;
use std::fs;

#[test]
fn occupied_candidates_are_preserved_and_the_empty_target_is_retained() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("component")).unwrap();
    fs::write(root.path().join("component/original"), b"keep").unwrap();
    fs::create_dir(root.path().join("component_1")).unwrap();
    fs::write(root.path().join("component_1/original"), b"keep too").unwrap();
    let mut directories = vec!["component".into()];
    let plan = prepare(root.path(), &mut directories, &Map::new()).unwrap();
    assert_eq!(directories, ["component_2"]);
    assert_eq!(fs::read(root.path().join("component/original")).unwrap(), b"keep");
    assert_eq!(
        plan.warnings,
        [
            r#"unable to import into "component" (the directory is not empty), importing into "component_2" instead"#
        ],
    );
    plan.validate().unwrap();
    fs::create_dir(root.path().join("component_2")).unwrap();
    assert!(plan.validate().is_err());
}

#[test]
fn changed_occupied_inventory_invalidates_the_retained_choice() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("component")).unwrap();
    fs::write(root.path().join("component/original"), b"keep").unwrap();
    let plan = prepare(root.path(), &mut ["component".into()], &Map::new()).unwrap();
    fs::remove_file(root.path().join("component/original")).unwrap();
    assert!(plan.validate().is_err());
}

#[test]
fn absent_nested_parents_are_retained_without_requiring_creation_during_planning() {
    let root = tempfile::tempdir().unwrap();
    let mut directories = vec!["components/nested/comp00".into()];
    let plan = prepare(root.path(), &mut directories, &Map::new()).unwrap();
    assert_eq!(directories, ["components/nested/comp00"]);
    assert!(!root.path().join("components").exists());
    plan.validate().unwrap();
    fs::create_dir(root.path().join("components")).unwrap();
    assert!(plan.validate().is_err());
}
