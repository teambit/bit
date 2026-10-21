use super::{
    Options, format_empty_gc_report, parse_keep_versions, parse_options, restore_deleted_objects,
};
use crate::commands::color::Chalk;
use std::fs;
use tempfile::tempdir;

#[test]
fn parses_gc_options_and_keep_versions() {
    assert_eq!(
        parse_options(&["-d", "--backup", "--keep-versions", "5", "-v", "-j"]),
        Some(Options {
            dry_run: true,
            keep_versions: Some("5".into()),
            backup: true,
            restore: false,
            restore_overwrite: false,
            verbose: true,
            json: true,
        }),
    );
    assert_eq!(parse_keep_versions("0"), Some(0));
    assert_eq!(parse_keep_versions("10"), Some(10));
    assert_eq!(parse_keep_versions("-1"), None);
    assert_eq!(parse_keep_versions("1.5"), None);
    assert_eq!(parse_keep_versions("abc"), None);
}

#[test]
fn restores_deleted_objects_and_formats_empty_report() {
    let dir = tempdir().expect("tempdir");
    let err = restore_deleted_objects(dir.path(), false).expect_err("missing backup should error");
    assert!(err.contains("there is nothing to restore"));

    let backup_sub = dir
        .path()
        .join("deleted-objects")
        .join("ab");
    fs::create_dir_all(&backup_sub).expect("create backup dir");
    fs::write(backup_sub.join("cdef"), b"payload").expect("write object");
    restore_deleted_objects(dir.path(), false).expect("restore should succeed");
    assert!(
        dir.path()
            .join("objects")
            .join("ab")
            .join("cdef")
            .is_file(),
    );
    assert!(
        !dir.path()
            .join("deleted-objects")
            .exists(),
    );

    let report = format_empty_gc_report(true, false, Chalk::new(false));
    assert!(report.contains("[dry-run] 0 of 0 objects can be removed"));
}
