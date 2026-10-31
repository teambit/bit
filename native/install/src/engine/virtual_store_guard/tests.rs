use super::{assert_safe_transition, recorded_virtual_store_dir};
use std::fs;

#[test]
fn reads_the_recorded_virtual_store_dir() {
    assert_eq!(
        recorded_virtual_store_dir(r#"{"virtualStoreDir":".pnpm"}"#).as_deref(),
        Some(".pnpm"),
    );
    assert_eq!(
        recorded_virtual_store_dir("layoutVersion: 5\nvirtualStoreDir: ../../store/links\n")
            .as_deref(),
        Some("../../store/links"),
    );
    assert_eq!(
        recorded_virtual_store_dir("  \"virtualStoreDir\": \".pnpm\",\n").as_deref(),
        Some(".pnpm"),
    );
    assert_eq!(recorded_virtual_store_dir("{}"), None);
}

#[test]
fn a_self_hosted_bit_cannot_switch_layouts() {
    let dir = tempfile::tempdir().expect("temp dir");
    let modules = dir.path().join("node_modules");
    fs::create_dir_all(modules.join(".pnpm")).expect("mkdir");
    fs::create_dir_all(modules.join("@teambit").join("bit")).expect("mkdir");
    fs::write(modules.join(".modules.yaml"), r#"{"virtualStoreDir":".pnpm"}"#).expect("write");
    let self_hosted = modules.join("@teambit").join("bit");
    let error = assert_safe_transition(dir.path(), true, &self_hosted).expect_err("self hosted");
    assert!(
        error
            .to_string()
            .contains("from the project-local virtual store to the global virtual store"),
    );
    // The same layout, or a bit installed elsewhere, is fine.
    assert_safe_transition(dir.path(), false, &self_hosted).expect("same layout");
    let elsewhere = tempfile::tempdir().expect("temp dir");
    assert_safe_transition(dir.path(), true, elsewhere.path()).expect("not self hosted");
}

#[test]
fn a_fresh_workspace_has_nothing_to_guard() {
    let dir = tempfile::tempdir().expect("temp dir");
    assert_safe_transition(dir.path(), true, dir.path()).expect("fresh");
}
