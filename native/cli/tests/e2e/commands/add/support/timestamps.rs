//! Replay the same dependency-cache freshness inputs instead of timestamps from fixture copying.
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

pub(super) struct Snapshot(BTreeMap<PathBuf, SystemTime>);

impl Snapshot {
    pub(super) fn read(root: &Path) -> Self {
        let mut snapshot = Self(BTreeMap::new());
        snapshot.visit(root, root);
        snapshot
    }

    pub(super) fn restore(&self, root: &Path) {
        for (relative, modified) in &self.0 {
            let path = root.join(relative);
            open(&path)
                .set_times(fs::FileTimes::new().set_modified(*modified))
                .unwrap();
            assert_eq!(
                fs::metadata(&path)
                    .unwrap()
                    .modified()
                    .unwrap(),
                *modified,
                "{path:?}",
            );
        }
    }

    fn visit(&mut self, root: &Path, path: &Path) {
        let metadata = fs::symlink_metadata(path).unwrap();
        if metadata.file_type().is_symlink() {
            return;
        }
        self.0.insert(
            path.strip_prefix(root)
                .unwrap()
                .to_path_buf(),
            metadata.modified().unwrap(),
        );
        if metadata.is_dir() {
            for entry in fs::read_dir(path).unwrap() {
                self.visit(root, &entry.unwrap().path());
            }
        }
    }
}

#[cfg(not(windows))]
fn open(path: &Path) -> fs::File {
    fs::File::open(path).unwrap()
}

#[cfg(windows)]
fn open(path: &Path) -> fs::File {
    use std::os::windows::fs::OpenOptionsExt as _;
    fs::OpenOptions::new()
        .access_mode(0x0100)
        .custom_flags(0x0200_0000)
        .open(path)
        .unwrap()
}
