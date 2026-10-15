use super::prune_modules;
use std::{collections::HashSet, fs, path::Path};

const CURRENT_LOCKFILE: &str = "lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      a:
        specifier: 1.0.0
        version: 1.0.0(b@2.0.0)

packages:

  a@1.0.0:
    resolution: {integrity: sha512-aaaa}

  b@2.0.0:
    resolution: {integrity: sha512-bbbb}

snapshots:

  a@1.0.0(b@2.0.0): {}

  b@2.0.0: {}
";

fn virtual_store(root: &Path) -> std::path::PathBuf {
    root.join("node_modules").join(".pnpm")
}

fn entries(dir: &Path) -> HashSet<String> {
    fs::read_dir(dir)
        .expect("read dir")
        .map(|entry| {
            entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect()
}

#[test]
fn removes_directories_the_current_lockfile_does_not_list() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = virtual_store(dir.path());
    for name in ["a@1.0.0_b@2.0.0", "b@2.0.0", "c@3.0.0", "loaded@1.0.0", "node_modules"] {
        fs::create_dir_all(store.join(name)).expect("mkdir");
    }
    fs::write(store.join("stray-file"), "").expect("write");
    fs::write(store.join("lock.yaml"), CURRENT_LOCKFILE).expect("write");
    prune_modules(dir.path(), &HashSet::from(["loaded@1.0.0".to_string()])).expect("prune");
    let expected: HashSet<String> =
        ["a@1.0.0_b@2.0.0", "b@2.0.0", "loaded@1.0.0", "node_modules", "lock.yaml"]
            .map(str::to_string)
            .into();
    assert_eq!(entries(&store), expected);
}

#[test]
fn without_a_current_lockfile_nothing_is_pruned() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = virtual_store(dir.path());
    fs::create_dir_all(store.join("c@3.0.0")).expect("mkdir");
    prune_modules(dir.path(), &HashSet::new()).expect("prune");
    assert!(store.join("c@3.0.0").exists());
}

#[test]
fn a_missing_virtual_store_is_fine() {
    let dir = tempfile::tempdir().expect("temp dir");
    prune_modules(dir.path(), &HashSet::new()).expect("prune");
}
