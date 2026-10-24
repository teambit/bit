//! Replay original regular-file alias topology before running the second implementation.
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

type Identity = (u64, u64);
pub(super) struct Snapshot(Vec<Vec<PathBuf>>);
impl Snapshot {
    pub(super) fn read(root: &Path) -> Self {
        let mut groups = BTreeMap::new();
        visit(root, root, &mut groups);
        Self(
            groups
                .into_values()
                .filter(|paths| paths.len() > 1)
                .collect(),
        )
    }
    pub(super) fn restore(&self, root: &Path) {
        for group in &self.0 {
            let original = root.join(&group[0]);
            for relative in &group[1..] {
                let alias = root.join(relative);
                assert_eq!(fs::read(&original).unwrap(), fs::read(&alias).unwrap(), "{alias:?}");
                assert_eq!(
                    super::mode(&fs::metadata(&original).unwrap()),
                    super::mode(&fs::metadata(&alias).unwrap()),
                    "{alias:?}",
                );
                fs::remove_file(&alias).unwrap();
                fs::hard_link(&original, &alias).unwrap();
                assert_eq!(
                    identity(&original),
                    identity(&alias),
                    "hardlink alias not restored: {alias:?}",
                );
            }
        }
    }
}
fn visit(root: &Path, directory: &Path, groups: &mut BTreeMap<Identity, Vec<PathBuf>>) {
    for entry in fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        let metadata = fs::symlink_metadata(&path).unwrap();
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            visit(root, &path, groups);
        } else if metadata.is_file() {
            groups
                .entry(identity(&path))
                .or_default()
                .push(
                    path.strip_prefix(root)
                        .unwrap()
                        .to_path_buf(),
                );
        }
    }
}
#[cfg(unix)]
fn identity(path: &Path) -> Identity {
    use std::os::unix::fs::MetadataExt;
    let metadata = fs::metadata(path).unwrap();
    (metadata.dev(), metadata.ino())
}
#[cfg(windows)]
fn identity(path: &Path) -> Identity {
    let file = fs::File::open(path).unwrap();
    let information = winapi_util::file::information(&file).unwrap();
    (information.volume_serial_number(), information.file_index())
}
#[cfg(not(any(unix, windows)))]
fn identity(_path: &Path) -> Identity {
    panic!("hardlink fixture replay requires Unix or Windows file identity support")
}
