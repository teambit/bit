#[cfg(test)]
mod tests;

use chrono::{Datelike, NaiveDate, NaiveDateTime, Timelike};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs,
    path::Path,
    thread,
    time::{Duration, Instant},
};

#[derive(Clone)]
pub(super) struct Snapshot {
    metadata: Vec<u8>,
    files: BTreeMap<String, (Vec<u8>, u32)>,
    modes: BTreeMap<String, u32>,
}
impl Snapshot {
    pub(super) fn read(root: &Path) -> Self {
        let scope = bit_object_import::scope_path(root);
        let mut files = BTreeMap::new();
        let mut modes = BTreeMap::new();
        let directory = scope.join("bitmap-history");
        if fs::symlink_metadata(&directory).is_ok() {
            assert!(regular(&directory).is_dir());
            modes.insert("directory".into(), mode(&regular(&directory)));
            for entry in fs::read_dir(&directory).unwrap() {
                let path = entry.unwrap().path();
                assert!(regular(&path).is_file());
                let name = path
                    .file_name()
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_owned();
                parse(name.strip_prefix(".bitmap-").expect("canonical backup filename"));
                files.insert(name, (fs::read(&path).unwrap(), mode(&regular(&path))));
            }
        }
        let path = scope.join("bitmap-history-metadata.txt");
        let metadata = if fs::symlink_metadata(&path).is_ok() {
            assert!(regular(&path).is_file());
            modes.insert("metadata".into(), mode(&regular(&path)));
            fs::read(path).unwrap()
        } else {
            Vec::new()
        };
        Self { metadata, files, modes }
    }
    pub(super) fn wait_past(&self) {
        let latest = self.files
            .keys()
            .map(|name| parse(name.strip_prefix(".bitmap-").unwrap()))
            .max();
        let started = Instant::now();
        while latest.is_some_and(|latest| {
            chrono::Local::now()
                .naive_local()
                .with_nanosecond(0)
                .unwrap()
                <= latest
        }) {
            assert!(started.elapsed() < Duration::from_secs(10), "history clock did not advance");
            thread::sleep(Duration::from_millis(10));
        }
    }
    pub(super) fn record(&self, evidence: &Path) {
        let record = json!({"metadata":self.metadata,"files":self.files,"modes":self.modes});
        let name = format!(
            "raw-{}-{}.json",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap(),
        );
        fs::write(evidence.join(name), serde_json::to_vec_pretty(&record).unwrap()).unwrap();
    }
    pub(super) fn validate(
        &self,
        baseline: &Self,
        transitions: &[Value],
        started: i64,
        ended: i64,
    ) -> BTreeMap<String, Vec<u8>> {
        let appended = self.metadata
            .strip_prefix(baseline.metadata.as_slice())
            .expect("unchanged baseline metadata");
        let text = std::str::from_utf8(appended).unwrap();
        let rows: Vec<_> = text.split_inclusive('\n').collect();
        assert_eq!(rows.len(), transitions.len(), "exact raw write count: {text}");
        let expected = Self::expected_backups(baseline, &rows, transitions, started, ended);
        assert!(
            self.files == expected,
            "raw backups differ: actual {:?}; expected {:?}",
            self.files,
            expected,
        );
        for (name, mode) in &baseline.modes {
            assert_eq!(self.modes.get(name), Some(mode));
        }
        let mut logical = BTreeMap::new();
        logical.insert("modes".into(), serde_json::to_vec(&self.modes).unwrap());
        for (index, transition) in transitions.iter().enumerate() {
            logical.insert(format!("write/{index}"), serde_json::to_vec(transition).unwrap());
        }
        logical
    }
    fn expected_backups(
        baseline: &Self,
        rows: &[&str],
        transitions: &[Value],
        started: i64,
        ended: i64,
    ) -> BTreeMap<String, (Vec<u8>, u32)> {
        let mut expected = baseline.files.clone();
        let mut previous = None;
        for (row, transition) in rows.iter().zip(transitions) {
            let (identity, reason) = row
                .strip_suffix('\n')
                .unwrap()
                .split_once(' ')
                .unwrap();
            let date = parse(identity);
            window(date, started, ended);
            assert!(previous.is_none_or(|previous| previous <= date), "nonmonotonic backup IDs");
            previous = Some(date);
            assert_eq!(reason, transition["reason"].as_str().unwrap());
            let filename = format!(".bitmap-{identity}");
            assert!(!baseline.files.contains_key(&filename), "baseline clock collision");
            expected.insert(
                filename,
                (decode(transition["preimage_hex"].as_str().unwrap()), oracle_mode(transition)),
            );
        }
        expected
    }
}
fn parse(identity: &str) -> NaiveDateTime {
    let fields: Vec<u32> = identity
        .split('-')
        .map(|field| field.parse().unwrap())
        .collect();
    assert_eq!(fields.len(), 6);
    let date = NaiveDate::from_ymd_opt(i32::try_from(fields[0]).unwrap(), fields[1], fields[2])
        .unwrap()
        .and_hms_opt(fields[3], fields[4], fields[5])
        .unwrap();
    assert_eq!(
        identity,
        format!(
            "{}-{}-{}-{}-{}-{}",
            date.year(),
            date.month(),
            date.day(),
            date.hour(),
            date.minute(),
            date.second()
        ),
        "canonical unpadded bitmap backup identity",
    );
    date
}
fn window(date: NaiveDateTime, started: i64, ended: i64) {
    let start = chrono::DateTime::from_timestamp_millis(started)
        .unwrap()
        .with_timezone(&chrono::Local)
        .naive_local()
        .with_nanosecond(0)
        .unwrap();
    let end = chrono::DateTime::from_timestamp_millis(ended)
        .unwrap()
        .with_timezone(&chrono::Local)
        .naive_local()
        .with_nanosecond(0)
        .unwrap();
    assert!(start <= date && date <= end, "backup outside actual command window");
}
fn regular(path: &Path) -> fs::Metadata {
    let metadata = fs::symlink_metadata(path).unwrap();
    assert!(!metadata.file_type().is_symlink(), "symlink history input {}", path.display());
    metadata
}
fn decode(hex: &str) -> Vec<u8> {
    assert_eq!(hex.len() % 2, 0);
    hex.as_bytes()
        .chunks_exact(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect()
}
#[cfg(unix)]
fn mode(metadata: &fs::Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o7777
}
#[cfg(not(unix))]
fn mode(metadata: &fs::Metadata) -> u32 {
    u32::from(metadata.permissions().readonly())
}
fn oracle_mode(transition: &Value) -> u32 {
    let mode = u32::try_from(transition["mode"].as_u64().unwrap()).unwrap();
    if cfg!(unix) { mode } else { u32::from(mode & 0o222 == 0) }
}
