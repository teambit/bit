use super::{Snapshot, oracle_mode, parse};
use chrono::TimeZone;
use serde_json::{Value, json};
use std::collections::BTreeMap;

fn transitions() -> Vec<Value> {
    vec![
        json!({"reason":"import","preimage_hex":"61","mode":420}),
        json!({"reason":"recover","preimage_hex":"62","mode":420}),
    ]
}
fn sample(separate: bool) -> Snapshot {
    let second = if separate { "2026-10-18-12-0-1" } else { "2026-10-18-12-0-0" };
    let transitions = transitions();
    let mut files = BTreeMap::new();
    files.insert(".bitmap-2026-10-18-12-0-0".into(), (b"a".to_vec(), oracle_mode(&transitions[0])));
    files.insert(format!(".bitmap-{second}"), (b"b".to_vec(), oracle_mode(&transitions[1])));
    Snapshot {
        metadata: format!("2026-10-18-12-0-0 import\n{second} recover\n").into_bytes(),
        files,
        modes: BTreeMap::new(),
    }
}
fn baseline() -> Snapshot {
    Snapshot { metadata: Vec::new(), files: BTreeMap::new(), modes: BTreeMap::new() }
}
fn interval() -> (i64, i64) {
    let start = chrono::Local
        .with_ymd_and_hms(2026, 10, 18, 12, 0, 0)
        .single()
        .unwrap();
    (start.timestamp_millis(), start.timestamp_millis() + 1999)
}
#[test]
fn different_clock_groups_are_equal_only_after_last_writer_bytes_are_proven() {
    let (start, end) = interval();
    let same = sample(false).validate(&baseline(), &transitions(), start, end);
    let separate = sample(true).validate(&baseline(), &transitions(), start, end);
    assert_eq!(same, separate);
}
#[test]
#[should_panic(expected = "raw backups differ")]
fn stale_first_writer_bytes_do_not_pass_a_same_second_overwrite() {
    let (start, end) = interval();
    let mut current = sample(false);
    current.files
        .values_mut()
        .next()
        .unwrap()
        .0 = b"a".to_vec();
    current.validate(&baseline(), &transitions(), start, end);
}
#[test]
#[should_panic(expected = "unchanged baseline metadata")]
fn unchanged_prefix_is_required_before_any_logical_projection() {
    let (start, end) = interval();
    let mut prior = baseline();
    prior.metadata = b"prior\n".to_vec();
    sample(false).validate(&prior, &transitions(), start, end);
}
#[test]
#[should_panic(expected = "canonical")]
fn padded_clock_ids_are_rejected() {
    let _ = parse("2026-10-18-12-00-0");
}

#[test]
#[should_panic(expected = "raw backups differ")]
fn an_unreferenced_extra_snapshot_is_rejected() {
    let (start, end) = interval();
    let mut current = sample(false);
    current.files.insert(".bitmap-2026-10-18-12-0-1".into(), (b"a".to_vec(), 0));
    current.validate(&baseline(), &transitions(), start, end);
}

#[test]
#[should_panic(expected = "backup outside actual command window")]
fn a_valid_identity_outside_the_observed_clock_window_is_rejected() {
    let (start, _) = interval();
    sample(true).validate(&baseline(), &transitions(), start, start);
}

#[test]
#[should_panic(expected = "baseline clock collision")]
fn baseline_ids_cannot_be_overwritten_by_fresh_writes() {
    let (start, end) = interval();
    let mut prior = baseline();
    prior.files.insert(".bitmap-2026-10-18-12-0-0".into(), (b"prior".to_vec(), 0));
    sample(false).validate(&prior, &transitions(), start, end);
}
