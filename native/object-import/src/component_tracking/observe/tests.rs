use super::Observed;
use crate::component_tracking::tests::fixture;
use std::fs;

#[test]
fn a_repeated_control_read_cannot_replace_the_original_preimage() {
    let root = fixture();
    let mut observed = Observed::default();
    observed
        .read(&root.join(".bitmap"))
        .unwrap();
    fs::write(root.join(".bitmap"), "{}").unwrap();
    assert!(
        observed
            .read(&root.join(".bitmap"))
            .is_err(),
    );
    assert!(observed.validate().is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_repeated_directory_read_cannot_replace_the_original_inventory() {
    let root = fixture();
    let mut observed = Observed::default();
    observed.directory(&root).unwrap();
    fs::write(root.join("added.js"), "changed").unwrap();
    assert!(observed.directory(&root).is_err());
    assert!(observed.validate().is_err());
    fs::remove_dir_all(root).unwrap();
}

#[cfg(any(unix, windows))]
#[test]
fn an_existing_symlink_ancestor_declines_before_source_capture() {
    let root = fixture();
    fs::create_dir_all(root.join("actual/component")).unwrap();
    link(&root.join("actual"), &root.join("alias"));
    let mut observed = Observed::default();
    assert!(
        observed
            .ancestors(&root, &root.join("alias/component"))
            .is_err(),
    );
    fs::remove_dir_all(root).unwrap();
}

#[cfg(any(unix, windows))]
#[test]
fn an_ancestor_swapped_for_a_symlink_cannot_reuse_identical_sources() {
    let root = fixture();
    fs::create_dir_all(root.join("parent/component")).unwrap();
    fs::write(root.join("parent/component/index.js"), "same bytes").unwrap();
    let mut observed = Observed::default();
    observed
        .ancestors(&root, &root.join("parent/component"))
        .unwrap();
    observed
        .read(&root.join("parent/component/index.js"))
        .unwrap();
    fs::rename(root.join("parent"), root.join("replacement")).unwrap();
    link(&root.join("replacement"), &root.join("parent"));
    assert!(observed.validate().is_err());
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
fn link(source: &std::path::Path, destination: &std::path::Path) {
    std::os::unix::fs::symlink(source, destination).unwrap();
}
#[cfg(windows)]
fn link(source: &std::path::Path, destination: &std::path::Path) {
    junction::create(source, destination).unwrap();
}
