//! A real tmpfs backup forces the released collector's cross-device copy/remove path.
use super::{compare_with_snapshot, fixture, objects, orphan, tree};
use std::{
    fs,
    os::unix::fs::{MetadataExt, symlink},
};

#[test]
fn bare_collection_moves_files_and_links_across_devices_without_node() {
    for linked in [false, true] {
        let helper = fixture();
        let scope = &helper.scopes.remote_path;
        let hash = orphan(scope);
        let source = objects::path(scope, "objects", &hash);
        if linked {
            fs::rename(&source, scope.join("source-payload")).unwrap();
            symlink("../../source-payload", &source).unwrap();
        }
        let backup = tempfile::Builder::new()
            .prefix("bit-gc-")
            .tempdir_in("/dev/shm")
            .unwrap();
        assert_ne!(fs::metadata(scope).unwrap().dev(), fs::metadata(backup.path()).unwrap().dev());
        symlink(backup.path(), scope.join("deleted-objects")).unwrap();
        let run = compare_with_snapshot(
            &helper,
            "gc",
            false,
            |_| {
                fs::remove_dir_all(backup.path()).unwrap();
                fs::create_dir(backup.path()).unwrap();
            },
            |_| {},
            |scope| {
                let mut state = tree(scope);
                state.extend(
                    tree(backup.path())
                        .into_iter()
                        .map(|(key, value)| (format!("backup/{key}"), value)),
                );
                state
            },
        );
        assert!(run.status.success(), "{run:?}");
        assert!(!source.exists());
        let target = backup
            .path()
            .join(&hash[..2])
            .join(&hash[2..]);
        if linked {
            assert_eq!(
                fs::read_link(target).unwrap(),
                std::path::Path::new("../../source-payload"),
            );
        } else {
            assert!(target.is_file());
        }
    }
}
