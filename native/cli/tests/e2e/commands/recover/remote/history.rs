//! Two published writes are compared independently of their live second-resolution grouping.
mod raw;

use crate::{
    commands::move_paths::support,
    helper::{Helper, Run, setup},
};
use serde_json::Value;
use std::{collections::BTreeMap, ffi::OsStr, fs, path::Path};

pub(super) fn compare(helper: &Helper, command: &str, stdout: fn(&str) -> String) -> Run {
    let evidence = tempfile::Builder::new()
        .prefix("recovery history ")
        .tempdir()
        .unwrap()
        .keep();
    eprintln!("recovery bitmap history evidence: {}", evidence.display());
    let root = &helper.scopes.local_path;
    let baseline = raw::Snapshot::read(root);
    fs::write(evidence.join("baseline.bitmap"), fs::read(root.join(".bitmap")).unwrap()).unwrap();
    baseline.wait_past();
    let oracle =
        support::prepare_history(helper, || prepare(helper, command, &evidence, &baseline));
    let observe = |root: &Path, started, ended| oracle.validate(root, started, ended, &evidence);
    support::compare_with_history(helper, command, stdout, &observe)
}
fn prepare(helper: &Helper, command: &str, evidence: &Path, baseline: &raw::Snapshot) -> Oracle {
    let started = chrono::Utc::now().timestamp_millis();
    let output = observe(helper, command, evidence);
    let ended = chrono::Utc::now().timestamp_millis();
    fs::write(evidence.join("preparation.stdout"), &output.stdout).unwrap();
    fs::write(evidence.join("preparation.stderr"), &output.stderr).unwrap();
    assert!(
        output.status.success(),
        "preparation failed: {} {}; evidence {}",
        output.stdout,
        output.stderr,
        evidence.display(),
    );
    let oracle = Oracle::read(&helper.scopes.local_path, baseline, evidence);
    oracle.validate(&helper.scopes.local_path, started, ended, evidence);
    oracle
}
fn observe(helper: &Helper, command: &str, evidence: &Path) -> Run {
    let script = evidence.join("observe.cjs");
    fs::write(&script, include_str!("history/observe.cjs")).unwrap();
    let options = format!("--require={}", serde_json::to_string(script.to_str().unwrap()).unwrap());
    let package = setup::shared().node_cli
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[
            ("BIT_NATIVE", OsStr::new("off")),
            ("BIT_NATIVE_QUIET", OsStr::new("1")),
            ("NODE_OPTIONS", OsStr::new(&options)),
            ("BITMAP_HISTORY_ORACLE_DIRECTORY", evidence.as_os_str()),
            ("BITMAP_HISTORY_ORACLE_ROOT", helper.scopes.local_path.as_os_str()),
            ("BITMAP_HISTORY_ORACLE_PACKAGE", package.as_os_str()),
        ],
    )
}

struct Oracle {
    baseline: raw::Snapshot,
    transitions: Vec<Value>,
    final_bitmap: Vec<u8>,
}
impl Oracle {
    fn read(root: &Path, baseline: &raw::Snapshot, evidence: &Path) -> Self {
        let journal = fs::read_to_string(evidence.join("transitions.jsonl")).unwrap();
        let transitions: Vec<Value> = journal
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(transitions.len(), 2, "exact import/recover writes: {journal}");
        for (index, row) in transitions.iter().enumerate() {
            assert_eq!(row["sequence"], index);
            for field in ["capture_error", "original_error", "validation_error"] {
                assert!(row.get(field).is_none(), "invalid oracle: {journal}");
            }
            assert!(row["reason"].is_string() && row["preimage_hex"].is_string());
            assert_eq!(row["backup_mode"], row["mode"]);
            assert_eq!(
                row["raw_metadata_line"],
                format!(
                    "{} {}\n",
                    row["identity"].as_str().unwrap(),
                    row["reason"].as_str().unwrap()
                ),
            );
        }
        let initial = fs::read(evidence.join("baseline.bitmap")).unwrap();
        assert_eq!(transitions[0]["preimage_hex"], hex(&initial));
        assert_eq!(transitions[0]["reason"], "import");
        assert_eq!(transitions[1]["reason"], "recover");
        fs::write(evidence.join("final.bitmap"), fs::read(root.join(".bitmap")).unwrap()).unwrap();
        Self {
            baseline: baseline.clone(),
            transitions,
            final_bitmap: fs::read(root.join(".bitmap")).unwrap(),
        }
    }
    fn validate(
        &self,
        root: &Path,
        started: i64,
        ended: i64,
        evidence: &Path,
    ) -> BTreeMap<String, Vec<u8>> {
        let current = raw::Snapshot::read(root);
        current.record(evidence);
        assert_eq!(
            fs::read(root.join(".bitmap")).unwrap(),
            self.final_bitmap,
            "final bitmap; evidence {}",
            evidence.display(),
        );
        current.validate(&self.baseline, &self.transitions, started, ended)
    }
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::new(), |mut text, byte| {
            write!(&mut text, "{byte:02x}").unwrap();
            text
        })
}
