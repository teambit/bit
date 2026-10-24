use super::{Operation, prepare, proof};
use crate::workspace::engine::command::scratch;
#[test]
#[cfg(target_os = "linux")]
fn restore_removes_only_new_roots_and_preserves_backup_bytes() {
    let directory = scratch::Directory::create().unwrap();
    let root = &directory.0;
    let backup = root.join(".bit/last-merged");
    std::fs::create_dir_all(&backup).unwrap();
    std::fs::create_dir_all(root.join("old")).unwrap();
    std::fs::create_dir_all(root.join("added")).unwrap();
    let row =
        serde_json::json!({"scope":"scope.test","name":"old","version":"1.0.0","rootDir":"old"});
    let previous = serde_json::json!({"$schema-version":"17.0.0","old":row});
    let mut current = previous.clone();
    current["added"] = serde_json::json!({"scope":"scope.test","name":"added","version":"1.0.0","rootDir":"added"});
    let original = serde_json::to_vec(&previous).unwrap();
    std::fs::write(backup.join("bitmap"), &original).unwrap();
    std::fs::write(backup.join("workspace.jsonc"), b"{\"restored\":true}\n").unwrap();
    std::fs::write(root.join(".bitmap"), serde_json::to_vec(&current).unwrap()).unwrap();
    std::fs::write(root.join("workspace.jsonc"), b"{}").unwrap();
    std::fs::write(root.join(".bit/staged-snaps"), b"pending").unwrap();
    let mut proofs = Vec::new();
    let mut plan = prepare(root, Operation::LaneAbort, &mut proofs).unwrap();
    proof::verify(&proofs).unwrap();
    let original_permissions = std::fs::metadata(backup.join("bitmap")).unwrap().permissions();
    use std::os::unix::fs::PermissionsExt;
    let changed = std::fs::Permissions::from_mode(original_permissions.mode() ^ 0o100);
    std::fs::set_permissions(backup.join("bitmap"), changed).unwrap();
    assert!(plan.validate().is_err());
    assert!(root.join("added").is_dir());
    std::fs::set_permissions(backup.join("bitmap"), original_permissions).unwrap();
    plan.validate().unwrap();
    let controls = plan.controls();
    let mut dependencies = Vec::new();
    proof::read(&root.join(".bitmap"), &mut dependencies).unwrap();
    let source = root.join("old/index.js");
    std::fs::write(&source, b"original").unwrap();
    proof::read(&source, &mut dependencies).unwrap();
    plan.validate_dependencies(&dependencies).unwrap();
    let removed = proof::content(&root.join("added/index.js"), b"removed");
    assert!(
        plan.validate_dependencies(&[removed])
            .is_err(),
    );
    plan.publish().unwrap();
    let projected = controls.project(&dependencies, false).unwrap();
    assert_eq!(projected[1].hash, dependencies[1].hash);
    assert_ne!(projected[0].hash, dependencies[0].hash);
    controls.project(&proofs, true).unwrap();
    std::fs::write(&source, b"race").unwrap();
    assert!(controls.project(&dependencies, false).is_err());
    assert_eq!(std::fs::read(root.join(".bitmap")).unwrap(), original);
    assert!(root.join("old").is_dir());
    assert!(!root.join("added").exists());
    assert!(!backup.exists());
    assert!(!root.join(".bit/staged-snaps").exists());
}

#[test]
fn projected_controls_preserve_proof_forms_and_require_exact_bytes() {
    let directory = scratch::Directory::create().unwrap();
    let path = directory.0.join("control");
    std::fs::write(&path, b"before").unwrap();
    let mut rows = Vec::new();
    proof::read(&path, &mut rows).unwrap();
    proof::probe(&path, &mut rows).unwrap();
    rows.push(proof::metadata(&path, Some(&std::fs::metadata(&path).unwrap())).unwrap());
    std::fs::write(&path, b"after").unwrap();
    for original in &rows {
        let projected = proof::restored_control(original, Some(b"after")).unwrap();
        let original = serde_json::to_value(original).unwrap();
        let output = serde_json::to_value(&projected).unwrap();
        assert_eq!(
            original
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            output
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
        );
        proof::verify(&[projected]).unwrap();
    }
    assert!(proof::restored_control(&rows[0], Some(b"other")).is_err());
    assert!(proof::restored_control(&proof::range(&path, 0, b"after"), Some(b"after")).is_err());
    std::fs::remove_file(&path).unwrap();
    for original in &rows {
        proof::verify(&[proof::restored_control(original, None).unwrap()]).unwrap();
    }
}

#[test]
#[cfg(unix)]
fn absent_staged_backup_rejects_symlink_parent_before_removal() {
    let directory = scratch::Directory::create().unwrap();
    let root = directory.0.join("workspace");
    let external = directory.0.join("external");
    std::fs::create_dir_all(root.join(".bit")).unwrap();
    std::fs::create_dir_all(&external).unwrap();
    std::fs::write(external.join("main.json"), b"retained").unwrap();
    std::os::unix::fs::symlink(&external, root.join(".bit/staged-config")).unwrap();
    assert!(
        super::paths::staged(&root, &root.join(".bit/staged-config/main.json"), &mut Vec::new())
            .is_err(),
    );
    assert_eq!(std::fs::read(external.join("main.json")).unwrap(), b"retained");
    std::fs::remove_file(root.join(".bit/staged-config")).unwrap();
    super::paths::staged(&root, &root.join(".bit/staged-config/main.json"), &mut Vec::new())
        .unwrap();
}
