//! Replay dependency-cache freshness and directory permissions lost during fixture copying.
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

struct Entry {
    modified: SystemTime,
    permissions: Option<fs::Permissions>,
}
pub(super) struct Snapshot(BTreeMap<PathBuf, Entry>);

impl Snapshot {
    pub(super) fn read(root: &Path) -> Self {
        let mut snapshot = Self(BTreeMap::new());
        snapshot.visit(root, root);
        snapshot
    }

    pub(super) fn restore(&self, root: &Path) {
        for (relative, entry) in &self.0 {
            let path = root.join(relative);
            open(&path)
                .set_times(fs::FileTimes::new().set_modified(entry.modified))
                .unwrap();
            assert_eq!(
                fs::metadata(&path)
                    .unwrap()
                    .modified()
                    .unwrap(),
                entry.modified,
                "{path:?}",
            );
        }
        for (relative, entry) in self.0.iter().rev() {
            if let Some(permissions) = &entry.permissions {
                fs::set_permissions(root.join(relative), permissions.clone()).unwrap();
            }
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
            Entry {
                modified: metadata.modified().unwrap(),
                permissions: metadata.is_dir().then(|| metadata.permissions()),
            },
        );
        if metadata.is_dir() {
            for entry in fs::read_dir(path).unwrap() {
                self.visit(root, &entry.unwrap().path());
            }
        }
    }
}

#[cfg(all(test, unix))]
#[test]
fn restoring_a_fixture_retains_readonly_directory_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("cache");
    fs::create_dir(&directory).unwrap();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o555)).unwrap();
    let snapshot = Snapshot::read(root.path());
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o755)).unwrap();
    snapshot.restore(root.path());
    assert_eq!(
        fs::metadata(&directory)
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o555,
    );
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o755)).unwrap();
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
