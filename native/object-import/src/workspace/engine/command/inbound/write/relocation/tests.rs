use serde_json::{Map, Value};
use std::{fs, io, path::Path};

fn prepare(
    root: &Path,
    directories: &mut [String],
    rows: &Map<String, Value>,
) -> io::Result<super::Retained> {
    let mut retained = super::Retained::default();
    super::prepare_into(root, directories, rows, &mut retained)?;
    Ok(retained)
}

#[test]
fn owner_destination_is_retained_and_rejects_a_later_filesystem_change() {
    let root = tempfile::tempdir().unwrap();
    let target = crate::command_import::Target {
        scope: Some("second.shared".into()),
        name: "alpha".into(),
        version: "1.0.0".into(),
    };
    let rows = serde_json::json!({"alpha":{"name":"alpha","scope":"first.shared","version":"1.0.0","rootDir":"shared/alpha"}});
    let mut retained = super::Retained::default();
    assert_eq!(
        retained
            .avoid_tracked(root.path(), "shared/alpha".into(), &target, rows.as_object().unwrap())
            .unwrap(),
        "second/shared/alpha",
    );
    assert_eq!(
        retained.warnings,
        [
            r#""shared/alpha" is already used by first.shared/alpha@1.0.0, importing second.shared/alpha into "second/shared/alpha" instead"#
        ],
    );
    retained.validate().unwrap();
    fs::create_dir_all(root.path().join("second/shared/alpha")).unwrap();
    assert!(retained.validate().is_err());
}

#[test]
fn occupied_or_nested_owner_destinations_preserve_the_original_conflict() {
    let target = crate::command_import::Target {
        scope: Some("second.shared".into()),
        name: "alpha".into(),
        version: "1.0.0".into(),
    };
    for tracked in ["second", "second/shared/alpha", "second/shared/alpha/nested", "unrelated"] {
        let root = tempfile::tempdir().unwrap();
        let rows = serde_json::json!({"alpha":{"name":"alpha","scope":"first.shared","rootDir":"shared/alpha"},"other":{"name":"other","scope":"other.scope","rootDir":tracked}});
        if tracked == "unrelated" {
            fs::create_dir_all(root.path().join("second/shared/alpha")).unwrap();
            fs::write(root.path().join("second/shared/alpha/keep"), b"preserve").unwrap();
        }
        let mut retained = super::Retained::default();
        assert_eq!(
            retained
                .avoid_tracked(
                    root.path(),
                    "shared/alpha".into(),
                    &target,
                    rows.as_object().unwrap()
                )
                .unwrap(),
            "shared/alpha",
        );
        assert!(retained.warnings.is_empty());
        retained.validate().unwrap();
    }
}

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
