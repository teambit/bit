//! Map only validated clock IDs; metadata order preserves every snapshot and collision group.
mod tests;

use std::{collections::BTreeMap, fs, io, path::Path};

pub(super) struct Histories(BTreeMap<String, History>);
struct History {
    directory: String,
    prefix: &'static str,
    ids: BTreeMap<String, String>,
    original: Vec<u8>,
    normalized: Vec<u8>,
}
impl Histories {
    pub(super) fn read(root: &Path) -> Self {
        let mut histories = BTreeMap::new();
        for scope in [".bit/", ".git/bit/", ""] {
            for (directory, metadata, prefix) in [
                ("bitmap-history/", "bitmap-history-metadata.txt", ".bitmap-"),
                ("workspace-config-history/files/", "workspace-config-history/metadata.txt", ""),
            ] {
                let directory = format!("{scope}{directory}");
                let relative = format!("{scope}{metadata}");
                let path = root.join(&relative);
                if let Some(history) = History::read(root, &path, directory, prefix) {
                    assert!(histories.insert(relative, history).is_none());
                }
            }
        }
        Self(histories)
    }
    pub(super) fn path(&self, path: &str) -> String {
        for history in self.0.values() {
            if let Some(name) = path.strip_prefix(&history.directory) {
                if !name.starts_with(history.prefix) {
                    continue;
                }
                let id = name.strip_prefix(history.prefix).unwrap();
                validate_id(id);
                let token = history.ids
                    .get(id)
                    .cloned()
                    .unwrap_or_else(|| format!("ORPHAN-{id}"));
                return format!("{}{}{token}", history.directory, history.prefix);
            }
        }
        path.to_owned()
    }
    pub(super) fn metadata(&self, path: &str, bytes: &[u8]) -> Option<Vec<u8>> {
        self.0
            .get(path)
            .map(|history| {
                assert_eq!(history.original, bytes, "init history changed during inventory");
                history.normalized.clone()
            })
    }
}
impl History {
    fn read(root: &Path, path: &Path, directory: String, prefix: &'static str) -> Option<Self> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::NotADirectory,
                ) =>
            {
                return None;
            }
            Err(error) => panic!("init history metadata: {error}"),
        };
        assert!(metadata.is_file() && !metadata.file_type().is_symlink());
        let original = fs::read(path).unwrap();
        let mut ids = BTreeMap::new();
        let mut normalized = String::new();
        for line in std::str::from_utf8(&original).unwrap().split_inclusive('\n') {
            assert!(line.ends_with('\n'), "init history metadata newline missing");
            let (id, reason) = line.split_once(' ').expect("init history reason separator missing");
            validate_id(id);
            let next = format!("FILE_{}", ids.len());
            let token = ids.entry(id.to_owned()).or_insert(next);
            normalized.push_str(token);
            normalized.push(' ');
            normalized.push_str(reason);
            let backup = fs::symlink_metadata(
                root.join(&directory)
                    .join(format!("{prefix}{id}")),
            )
            .expect("referenced init history backup missing");
            assert!(backup.is_file() && !backup.file_type().is_symlink());
        }
        Some(Self { directory, prefix, ids, original, normalized: normalized.into_bytes() })
    }
}
fn validate_id(id: &str) {
    super::validate_date(id);
    for part in id.split('-') {
        assert!(part.bytes().all(|byte| byte.is_ascii_digit()), "invalid init history ID digit");
        let value = part.parse::<u32>().unwrap();
        assert_eq!(part, value.to_string(), "invalid init history ID padding");
    }
}
