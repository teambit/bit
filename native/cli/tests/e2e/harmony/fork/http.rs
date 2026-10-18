//! Real released file-backed HTTP scope; private fork capture must not import objects.
use super::support;
use crate::commands::{diff_completion::http as server, move_paths::support::successful};
use std::{collections::BTreeMap, fs, path::Path};
#[test]
fn http_single_fork_preserves_private_capture_and_original_provenance() {
    let helper = support::remote_workspace(1);
    let _server = server::start(&helper);
    let objects = bit_object_import::scope_path(&helper.scopes.local_path).join("objects");
    let before = inventory(&objects);
    successful(&helper, &format!("fork {}/comp1 comp-copy -x", helper.scopes.remote));
    assert_eq!(inventory(&objects), before, "remote fork must not publish its private closure");
    assert_eq!(support::ids(&helper), ["my-scope/comp-copy"]);
}
#[test]
fn http_pattern_batch_keeps_ordered_results_and_does_not_publish_remote_objects() {
    let helper = support::remote_workspace(2);
    support::delay_copies(&helper);
    let _server = server::start(&helper);
    let objects = bit_object_import::scope_path(&helper.scopes.local_path).join("objects");
    let before = inventory(&objects);
    successful(&helper, &format!(r#"fork "{}/*" --scope target.scope -x"#, helper.scopes.remote));
    assert_eq!(inventory(&objects), before, "batch capture must remain private");
    assert_eq!(
        support::ids(&helper),
        ["fixture.tools/env/fork-batch-barrier", "target.scope/comp1", "target.scope/comp2"],
    );
    support::assert_origins(&helper, &["comp1", "comp2"]);
}
fn inventory(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut files = BTreeMap::new();
    if root.exists() {
        visit(root, root, &mut files);
    }
    files
}
fn visit(root: &Path, directory: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
    for entry in fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            visit(root, &path, files);
        } else {
            files.insert(
                path.strip_prefix(root)
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_owned(),
                fs::read(path).unwrap(),
            );
        }
    }
}
