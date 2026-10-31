use super::{bounded_proof, refresh};
use std::fs;

#[test]
fn controls_retain_absence_and_reject_nonregular_or_over_budget_files() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("component.json");
    assert!(refresh(&path).unwrap()["hash"].is_null());
    fs::write(&path, "{}").unwrap();
    let first = refresh(&path).unwrap();
    assert_eq!(first, bit_install::policy::scope::read_proof(&path).unwrap());
    fs::write(&path, r#"{"changed":true}"#).unwrap();
    assert_ne!(refresh(&path).unwrap()["hash"], first["hash"]);
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_len(32 * 1024 * 1024 + 1)
        .unwrap();
    assert!(refresh(&path).is_err());
    // Bypass the initial metadata guard, as when the file grows after it.
    assert!(bounded_proof(&path, fs::File::open(&path).unwrap()).is_err());
    assert!(refresh(directory.path()).is_err());
}

#[cfg(unix)]
#[test]
fn a_control_symlink_cannot_replace_a_regular_preimage() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("outside.json");
    let path = directory.path().join("component.json");
    fs::write(&target, "{}").unwrap();
    std::os::unix::fs::symlink(&target, &path).unwrap();
    assert!(refresh(&path).is_err());
}
