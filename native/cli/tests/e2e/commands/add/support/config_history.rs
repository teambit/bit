//! Normalize only validated workspace-config backup clock IDs, preserving snapshots and reasons.
use super::{Backup, mode, validate_history_id};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

pub(super) struct Snapshot {
    metadata: String,
    files: BTreeMap<String, Backup>,
}
impl Snapshot {
    pub(super) fn read(root: &Path) -> Self {
        let directory = bit_object_import::scope_path(root).join("workspace-config-history");
        validate_layout(&directory);
        let files = fs::read_dir(directory.join("files"))
            .into_iter()
            .flatten()
            .map(|entry| {
                let path = entry.unwrap().path();
                let metadata = fs::symlink_metadata(&path).unwrap();
                assert!(
                    metadata.is_file() && !metadata.file_type().is_symlink(),
                    "invalid config backup: {path:?}",
                );
                let id = path
                    .file_name()
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_owned();
                validate_history_id(&id);
                let bytes = fs::read(&path).unwrap();
                bit_workspace_config::parse_jsonc(&bytes).unwrap();
                (id, Backup { bytes, mode: mode(&metadata) })
            })
            .collect();
        let snapshot = Self {
            metadata: fs::read_to_string(directory.join("metadata.txt")).unwrap_or_default(),
            files,
        };
        snapshot.validate();
        snapshot
    }
    fn validate(&self) {
        let mut referenced = BTreeSet::new();
        for line in self.metadata.split_inclusive('\n') {
            let (id, _) = entry(line);
            referenced.insert(id);
        }
        assert!(
            referenced
                == self.files
                    .keys()
                    .map(String::as_str)
                    .collect(),
            "unreferenced config backups",
        );
    }
}
pub(super) fn normalize(root: &Path, baseline: &Snapshot, output: &mut BTreeMap<String, Vec<u8>>) {
    let current = Snapshot::read(root);
    let appended =
        current.metadata.strip_prefix(&baseline.metadata).expect("baseline config history changed");
    let mut fresh = BTreeSet::new();
    output.retain(|path, _| !path.starts_with("workspace-config-history/"));
    output.insert("config-history/baseline-metadata".into(), baseline.metadata.as_bytes().to_vec());
    for (index, line) in appended.split_inclusive('\n').enumerate() {
        let (id, reason) = entry(line);
        fresh.insert(id);
        let backup = current.files.get(id).unwrap();
        record(output, &format!("config-history/fresh/{index}"), backup);
        output.insert(format!("config-history/fresh/{index}/reason"), reason.as_bytes().to_vec());
    }
    baseline_files(baseline, &current, &fresh, output);
    directory_modes(root, output);
}
fn baseline_files(
    baseline: &Snapshot,
    current: &Snapshot,
    fresh: &BTreeSet<&str>,
    output: &mut BTreeMap<String, Vec<u8>>,
) {
    for (id, backup) in &baseline.files {
        // Second-resolution filenames can be overwritten by this command. Keep
        // the original baseline snapshot and compare every newly retained body.
        if !fresh.contains(id.as_str()) {
            assert!(current.files.get(id) == Some(backup), "baseline config backup changed: {id}");
        }
        record(output, &format!("config-history/baseline/{id}"), backup);
    }
}
fn record(output: &mut BTreeMap<String, Vec<u8>>, prefix: &str, backup: &Backup) {
    output.insert(format!("{prefix}/snapshot"), backup.bytes.clone());
    output.insert(format!("{prefix}/mode"), backup.mode.clone());
}
fn entry(line: &str) -> (&str, &str) {
    assert!(line.ends_with('\n'), "config history metadata newline missing");
    let (id, reason) = line.split_once(' ').expect("config history reason missing");
    validate_history_id(id);
    assert!(
        !reason
            .trim_end_matches(['\r', '\n'])
            .is_empty(),
        "empty config history reason",
    );
    (id, reason)
}
fn directory_modes(root: &Path, output: &mut BTreeMap<String, Vec<u8>>) {
    let directory = bit_object_import::scope_path(root).join("workspace-config-history");
    for relative in ["", "files", "metadata.txt"] {
        let path = directory.join(relative);
        if let Ok(metadata) = fs::symlink_metadata(&path) {
            assert!(!metadata.file_type().is_symlink(), "config history symlink: {path:?}");
            if relative == "metadata.txt" {
                assert!(metadata.is_file(), "config history metadata file required: {path:?}");
            } else {
                assert!(metadata.is_dir(), "config history directory required: {path:?}");
            }
            output.insert(format!("config-history/{relative}/mode"), mode(&metadata));
        }
    }
}

fn validate_layout(directory: &Path) {
    if !directory.exists() {
        return;
    }
    for entry in fs::read_dir(directory).unwrap() {
        let entry = entry.unwrap();
        assert!(
            matches!(entry.file_name().to_str(), Some("files" | "metadata.txt")),
            "unexpected config history entry: {:?}",
            entry.path(),
        );
    }
}
