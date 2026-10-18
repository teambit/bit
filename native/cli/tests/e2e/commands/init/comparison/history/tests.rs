use super::super::inventory;
use std::{fmt::Write as _, fs, path::Path};

const FIRST: &str = "2026-10-18-12-0-0";
const SECOND: &str = "2026-10-18-12-0-1";
const THIRD: &str = "2026-10-18-12-0-2";
const FOURTH: &str = "2026-10-18-12-0-3";

fn fixture(root: &Path, ids: &[&str], bodies: &[&str], creation: &[usize]) {
    for (directory, metadata, prefix) in [
        (".bit/bitmap-history", ".bit/bitmap-history-metadata.txt", ".bitmap-"),
        (".bit/workspace-config-history/files", ".bit/workspace-config-history/metadata.txt", ""),
    ] {
        let directory = root.join(directory);
        fs::create_dir_all(&directory).unwrap();
        let mut lines = String::new();
        for (index, id) in ids.iter().enumerate() {
            writeln!(lines, "{id} snapshot-{index}").unwrap();
        }
        fs::write(root.join(metadata), lines).unwrap();
        for index in creation {
            fs::write(directory.join(format!("{prefix}{}", ids[*index])), bodies[*index]).unwrap();
        }
    }
}

#[test]
fn every_backup_survives_regardless_of_directory_creation_order() {
    let left = tempfile::tempdir().unwrap();
    let right = tempfile::tempdir().unwrap();
    fixture(left.path(), &[FIRST, SECOND], &["older", "newer"], &[1, 0]);
    fixture(right.path(), &[THIRD, FOURTH], &["older", "newer"], &[0, 1]);
    let actual = inventory(left.path(), false);
    assert_eq!(actual, inventory(right.path(), false));
    assert_eq!(actual[".bit/bitmap-history/.bitmap-FILE_0"], b"older");
    assert_eq!(actual[".bit/bitmap-history/.bitmap-FILE_1"], b"newer");
    assert_eq!(actual[".bit/workspace-config-history/files/FILE_0"], b"older");
    assert_eq!(actual[".bit/workspace-config-history/files/FILE_1"], b"newer");
}

#[test]
fn changed_bodies_and_different_collision_groups_remain_visible() {
    let baseline = tempfile::tempdir().unwrap();
    let changed = tempfile::tempdir().unwrap();
    let collision = tempfile::tempdir().unwrap();
    fixture(baseline.path(), &[FIRST, SECOND], &["older", "newer"], &[0, 1]);
    fixture(changed.path(), &[THIRD, FOURTH], &["older", "wrong"], &[0, 1]);
    fixture(collision.path(), &[THIRD, THIRD], &["older", "newer"], &[0, 1]);
    let expected = inventory(baseline.path(), false);
    assert_ne!(expected, inventory(changed.path(), false));
    assert_ne!(expected, inventory(collision.path(), false));
    let metadata = inventory(collision.path(), false);
    assert_eq!(
        metadata[".bit/bitmap-history-metadata.txt"],
        b"FILE_0 snapshot-0\nFILE_0 snapshot-1\n",
    );
}

#[test]
fn orphan_backups_are_retained_explicitly() {
    let directory = tempfile::tempdir().unwrap();
    fixture(directory.path(), &[FIRST], &["referenced"], &[0]);
    let baseline = inventory(directory.path(), false);
    fs::write(
        directory
            .path()
            .join(format!(".bit/bitmap-history/.bitmap-{SECOND}")),
        "orphan",
    )
    .unwrap();
    fs::write(
        directory
            .path()
            .join(format!(".bit/workspace-config-history/files/{SECOND}")),
        "orphan",
    )
    .unwrap();
    let actual = inventory(directory.path(), false);
    assert_ne!(baseline, actual);
    assert_eq!(actual[&format!(".bit/bitmap-history/.bitmap-ORPHAN-{SECOND}")], b"orphan");
    assert_eq!(actual[&format!(".bit/workspace-config-history/files/ORPHAN-{SECOND}")], b"orphan");
}

#[cfg(unix)]
#[test]
fn changed_backup_permissions_remain_visible() {
    use std::os::unix::fs::PermissionsExt;
    let directory = tempfile::tempdir().unwrap();
    fixture(directory.path(), &[FIRST], &["referenced"], &[0]);
    let baseline = inventory(directory.path(), false);
    let backup = directory
        .path()
        .join(format!(".bit/bitmap-history/.bitmap-{FIRST}"));
    let mode = fs::metadata(&backup)
        .unwrap()
        .permissions()
        .mode()
        ^ 0o100;
    fs::set_permissions(backup, fs::Permissions::from_mode(mode)).unwrap();
    assert_ne!(baseline, inventory(directory.path(), false));
}

#[test]
#[should_panic(expected = "referenced init history backup missing")]
fn missing_referenced_backups_are_rejected() {
    let directory = tempfile::tempdir().unwrap();
    fixture(directory.path(), &[FIRST], &["referenced"], &[0]);
    fs::remove_file(
        directory
            .path()
            .join(format!(".bit/bitmap-history/.bitmap-{FIRST}")),
    )
    .unwrap();
    inventory(directory.path(), false);
}

#[test]
fn unpadded_clock_fields_preserve_every_snapshot() {
    let left = tempfile::tempdir().unwrap();
    let right = tempfile::tempdir().unwrap();
    let ids = ["2026-1-2-3-4-0", "2026-1-2-3-4-9", "2026-1-2-3-4-10"];
    fixture(left.path(), &ids, &["first", "second", "third"], &[2, 0, 1]);
    fixture(right.path(), &[FIRST, SECOND, THIRD], &["first", "second", "third"], &[0, 1, 2]);
    assert_eq!(inventory(left.path(), false), inventory(right.path(), false));
}

#[test]
fn malformed_clock_ids_are_rejected() {
    for id in [
        "2026-01-2-3-4-5",
        "2026-1-2-3-4-05",
        "2026-1-2-3-4-+5",
        "2026-13-2-3-4-5",
        "2026-1-0-3-4-5",
        "2026-1-2-24-4-5",
        "2026-1-2-3-60-5",
        "2026-1-2-3-4-60",
        "2026-1-2-3-4",
    ] {
        assert!(std::panic::catch_unwind(|| super::validate_id(id)).is_err(), "accepted {id}");
    }
}
