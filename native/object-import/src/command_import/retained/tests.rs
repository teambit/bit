use crate::command_import::capture::Capture;
use std::{collections::HashMap, fs, path::PathBuf};

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let sequence = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root = std::env::temp_dir()
            .join(format!("bit-retained-publication-{}-{sequence}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn retaining_native_writes_rebases_only_owned_paths_and_preserves_other_read_proofs() {
    let directory = Directory::new();
    let object = directory.0.join("object");
    let control = directory.0.join("control");
    fs::write(&object, b"old").unwrap();
    fs::write(&control, b"control").unwrap();
    let mut capture = Capture::default();
    capture.read(&object).unwrap();
    capture.read(&control).unwrap();
    fs::write(&object, b"new").unwrap();
    let published = HashMap::from([(object.clone(), b"new".to_vec())]);
    capture.accept_published(&published).unwrap();
    capture.validate().unwrap();
    fs::write(&control, b"unowned change").unwrap();
    assert!(capture.accept_published(&published).is_err());
}

#[test]
fn retaining_a_write_rejects_bytes_that_differ_from_the_native_publication() {
    let directory = Directory::new();
    let path = directory.0.join("object");
    fs::write(&path, b"unexpected").unwrap();
    let mut capture = Capture::default();
    capture.read(&path).unwrap();
    assert!(
        capture
            .accept_published(&HashMap::from([(path, b"expected".to_vec())]))
            .is_err(),
    );
}
