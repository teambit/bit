use super::{HistoryState, read_history, validate};
use std::{
    fs,
    os::unix::fs::symlink,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static SEQUENCE: AtomicUsize = AtomicUsize::new(0);

struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-remove-history-leaf-{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join("workspace/.bit/objects/aa")).unwrap();
        Self(root)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn history_leaf_symlinks_are_rejected_before_and_after_preparation() {
    let scratch = Scratch::new();
    let root = scratch.0.join("workspace");
    let outside = scratch.0.join("outside");
    let path = root.join(".bit/objects/aa/history");
    fs::write(&outside, b"history").unwrap();
    symlink(&outside, &path).unwrap();
    assert!(read_history(&root, &path).is_err());
    fs::remove_file(&path).unwrap();
    fs::write(&path, b"history").unwrap();
    let state = HistoryState {
        path: path.clone(),
        before: read_history(&root, &path).unwrap(),
        after: Some(b"new-history".to_vec()),
    };
    fs::remove_file(&path).unwrap();
    symlink(&outside, &path).unwrap();
    assert!(validate(&root, &state).is_err());
    assert_eq!(fs::read(outside).unwrap(), b"history");
}
