//! Unsupported version metadata is delegated while the original object store remains intact.
use super::{fixture, objects, orphan, tree};
use crate::helper::Helper;
use std::{ffi::OsStr, fs};

#[test]
fn malformed_version_files_decline_before_any_collection_effect() {
    let helper = fixture();
    let scope = &helper.scopes.remote_path;
    let orphan = orphan(scope);
    let model = objects::digest(&format!("{}/comp1", helper.scopes.remote));
    let (_, model) = bit_object_import::read_scope_object(scope, &model).unwrap().unwrap();
    let head = model["head"].as_str().unwrap();
    let (_, mut version) = bit_object_import::read_scope_object(scope, head).unwrap().unwrap();
    version["files"] = serde_json::Value::Null;
    objects::write(scope, "Version", head, &serde_json::to_vec(&version).unwrap());
    let baseline = helper.clone_remote_scope();
    let expected = Helper::cmd_in_with(scope, "gc", &[("BIT_NATIVE", OsStr::new("off"))]);
    let expected_tree = tree(scope);
    helper.restore_remote_scope(&baseline);
    let actual = Helper::cmd_in(scope, "gc");
    assert!(!actual.native && !actual.status.success(), "{actual:?}");
    assert!(actual.trace.contains("version files or log metadata"), "{actual:?}");
    assert!(!actual.trace.contains("starting the JavaScript host"), "{actual:?}");
    assert_eq!(
        (actual.stdout, actual.stderr, actual.status.code()),
        (expected.stdout, expected.stderr, expected.status.code()),
    );
    assert_eq!(tree(scope), expected_tree);
    assert!(objects::path(scope, "objects", &orphan).is_file());
    assert!(!scope.join("deleted-objects").exists());
}

#[test]
fn early_move_layout_errors_delegate_without_starting_sibling_moves() {
    for directory in [false, true] {
        early_move_error(directory);
    }
}
fn early_move_error(directory: bool) {
    let helper = fixture();
    let scope = &helper.scopes.remote_path;
    let blocked = orphan(scope);
    let movable = "f".repeat(40);
    objects::write(scope, "Source", &movable, b"another unreachable source");
    let target = objects::path(scope, "deleted-objects", &blocked);
    let message = if directory {
        fs::create_dir_all(&target).unwrap();
        "Cannot overwrite directory"
    } else {
        fs::create_dir_all(scope.join("deleted-objects")).unwrap();
        fs::write(target.parent().unwrap(), b"blocked backup bucket").unwrap();
        "not a directory"
    };
    let before = tree(scope);
    let fallback = helper.scopes.e2e_dir.join("fallback.js");
    fs::write(&fallback, "process.stdout.write('delegated before collection\\n');\n").unwrap();
    let actual = Helper::cmd_in_with(scope, "gc", &[("BIT_NODE_CLI", fallback.as_os_str())]);
    assert!(!actual.native && actual.status.success(), "{actual:?}");
    assert_eq!(actual.stdout, "delegated before collection\n");
    assert!(actual.trace.contains(message), "{actual:?}");
    assert_eq!(tree(scope), before);
    assert!(objects::path(scope, "objects", &movable).is_file());
}
