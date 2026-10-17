use super::Store;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static COUNTER: AtomicU64 = AtomicU64::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-object-store-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _cleanup = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn concurrent_writes_are_atomic_and_duplicate_identities_keep_first_payload() {
    let directory = Directory::new();
    let store = Store::new(directory.0.clone(), None).unwrap();
    rayon::scope(|scope| {
        for _ in 0..16 {
            scope.spawn(|_| {
                store
                    .write(&"a".repeat(40), b"first")
                    .unwrap();
            });
        }
    });
    store
        .write(&"a".repeat(40), b"second")
        .unwrap();
    let parent = directory.0.join("aa");
    assert_eq!(fs::read(parent.join("a".repeat(38))).unwrap(), b"first");
    assert_eq!(fs::read_dir(parent).unwrap().count(), 1);
}

#[test]
fn failed_writes_are_not_marked_complete_and_failed_renames_clean_temporary_files() {
    let directory = Directory::new();
    let object_root = directory.0.join("objects");
    fs::write(&object_root, b"obstacle").unwrap();
    let store = Store::new(object_root.clone(), None).unwrap();
    assert!(
        store
            .write(&"b".repeat(40), b"data")
            .is_err(),
    );
    fs::remove_file(&object_root).unwrap();
    store
        .write(&"b".repeat(40), b"data")
        .unwrap();
    let parent = object_root.join("cc");
    fs::create_dir_all(parent.join("c".repeat(38))).unwrap();
    assert!(
        store
            .write(&"c".repeat(40), b"data")
            .is_err(),
    );
    assert_eq!(fs::read_dir(parent).unwrap().count(), 1);
    assert!(
        object_root
            .join("bb")
            .join("b".repeat(38))
            .is_file(),
    );
}

#[test]
fn invalid_paths_and_identities_cannot_escape_object_directory() {
    let directory = Directory::new();
    assert!(Store::new(PathBuf::from("relative"), None).is_err());
    let store = Store::new(directory.0.clone(), None).unwrap();
    for hash in ["../escape".into(), "A".repeat(40), "g".repeat(40), "a".repeat(39)] {
        assert!(store.write(&hash, b"data").is_err());
    }
    assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 0);
}

#[test]
fn independent_sessions_share_no_temporary_write_paths() {
    let directory = Directory::new();
    let barrier = std::sync::Barrier::new(8);
    let body = vec![b'x'; 2 * 1024 * 1024];
    std::thread::scope(|scope| {
        let writes: Vec<_> = (0..8)
            .map(|_| {
                let store = Store::new(directory.0.clone(), None).unwrap();
                let barrier = &barrier;
                let body = &body;
                scope.spawn(move || {
                    barrier.wait();
                    store.write(&"e".repeat(40), body)
                })
            })
            .collect();
        for write in writes {
            write.join().unwrap().unwrap();
        }
    });
    assert_eq!(
        fs::read(
            directory.0
                .join("ee")
                .join("e".repeat(38))
        )
        .unwrap(),
        body,
    );
    assert_eq!(fs::read_dir(directory.0.join("ee")).unwrap().count(), 1);
}

#[cfg(unix)]
#[test]
fn replacement_preserves_mode_and_existing_owner() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let directory = Directory::new();
    let parent = directory.0.join("dd");
    fs::create_dir(&parent).unwrap();
    let path = parent.join("d".repeat(38));
    fs::write(&path, b"old").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    let before = fs::metadata(&path).unwrap();
    let store = Store::new(directory.0.clone(), None).unwrap();
    store
        .write(&"d".repeat(40), b"new")
        .unwrap();
    let after = fs::metadata(&path).unwrap();
    assert_eq!(after.mode(), before.mode());
    assert_eq!((after.uid(), after.gid()), (before.uid(), before.gid()));
    assert_eq!(fs::read(path).unwrap(), b"new");
}

#[test]
fn metadata_publication_replaces_contents_and_rejects_nonregular_targets() {
    let directory = Directory::new();
    let path = directory.0.join("scope.json");
    Store::validate_metadata_write(&path).unwrap();
    Store::write_metadata(&path, br#"{"name":"scope"}"#).unwrap();
    Store::write_metadata(&path, b"{}\n").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"{}\n");
    let invalid = directory.0.join("directory");
    fs::create_dir(&invalid).unwrap();
    assert!(Store::validate_metadata_write(&invalid).is_err());
    assert!(Store::write_metadata(&invalid, b"rejected").is_err());
    assert_eq!(fs::read_dir(&invalid).unwrap().count(), 0);
}
