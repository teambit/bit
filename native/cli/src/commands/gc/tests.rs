use super::{
    Options,
    collector::collect_with_workspace_ids,
    format::{format_bytes, format_gc_report},
    format_empty_gc_report,
    graph::CompIdSpec,
    parse_keep_versions, parse_options, restore_deleted_objects,
};
use crate::commands::color::Chalk;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::Path,
    time::{Duration, SystemTime},
};
use tempfile::tempdir;

fn write_scope_obj(scope_dir: &Path, kind: &str, hash: &str, body: &[u8]) {
    let header = format!("{kind} {hash} {}\0", body.len());
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(header.as_bytes()).expect("write header");
    encoder.write_all(body).expect("write body");
    let compressed = encoder.finish().expect("finish zlib");
    let bucket = scope_dir
        .join("objects")
        .join(&hash[..2]);
    fs::create_dir_all(&bucket).expect("create bucket");
    let file_path = bucket.join(&hash[2..]);
    fs::write(&file_path, compressed).expect("write object");
    let old_time = SystemTime::now() - Duration::from_hours(1);
    let file = fs::File::options()
        .write(true)
        .open(&file_path)
        .expect("open file");
    file.set_times(fs::FileTimes::new().set_modified(old_time))
        .expect("set mtime");
}

fn write_json_obj(scope_dir: &Path, kind: &str, hash: &str, val: &Value) {
    let bytes = serde_json::to_vec(val).expect("serialize json");
    write_scope_obj(scope_dir, kind, hash, &bytes);
}

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
    assert_eq!(format_bytes(0), "0 B");
    assert_eq!(format_bytes(512), "512 B");
    assert_eq!(format_bytes(1536), "1.5 KB");
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

#[test]
fn collects_unreachable_versions_and_sources() {
    let dir = tempdir().expect("tempdir");
    let scope_dir = dir.path();
    let ver1 = "1111111111111111111111111111111111111111";
    let ver2 = "2222222222222222222222222222222222222222";
    let src1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let src2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let comp_hash = "cccccccccccccccccccccccccccccccccccccccc";
    write_scope_obj(scope_dir, "Source", src1, b"v1 source");
    write_scope_obj(scope_dir, "Source", src2, b"v2 source");
    write_json_obj(
        scope_dir,
        "Version",
        ver1,
        &json!({ "files": [{ "file": src1 }], "parents": [], "extensions": [] }),
    );
    write_json_obj(
        scope_dir,
        "Version",
        ver2,
        &json!({ "files": [{ "file": src2 }], "parents": [ver1], "extensions": [] }),
    );
    write_json_obj(
        scope_dir,
        "Component",
        comp_hash,
        &json!({
            "name": "bar/foo",
            "scope": "remote-scope",
            "versions": { "0.0.1": ver1, "0.0.2": ver2 },
            "head": ver2,
        }),
    );
    let remote_dir = scope_dir
        .join("refs")
        .join("remotes")
        .join("remote-scope");
    fs::create_dir_all(&remote_dir).expect("create remote dir");
    fs::write(
        remote_dir.join("main"),
        serde_json::to_vec(&json!([
            { "id": { "scope": "remote-scope", "name": "bar/foo" }, "head": ver2 }
        ]))
        .expect("serialize remote"),
    )
    .expect("write remote");
    let ws_ids = vec![CompIdSpec {
        scope: Some("remote-scope".into()),
        name: "bar/foo".into(),
        version: Some("0.0.2".into()),
    }];
    let dry_res = collect_with_workspace_ids(
        scope_dir,
        &ws_ids,
        &Options { dry_run: true, ..Options::default() },
    )
    .expect("dry run gc");
    assert_eq!(dry_res.deleted.objects, 2);
    assert_eq!(dry_res.kept_versions, 1);

    let keep_res = collect_with_workspace_ids(
        scope_dir,
        &ws_ids,
        &Options { keep_versions: Some("2".into()), ..Options::default() },
    )
    .expect("keep versions gc");
    assert_eq!(keep_res.deleted.objects, 0);
    assert_eq!(keep_res.kept_versions, 2);

    let backup_res = collect_with_workspace_ids(
        scope_dir,
        &ws_ids,
        &Options { backup: true, ..Options::default() },
    )
    .expect("backup gc");
    assert_eq!(backup_res.deleted.objects, 2);
    assert!(backup_res.flags.backup_dir.is_some());
    let report = format_gc_report(&backup_res, Chalk::new(false));
    assert!(report.contains("moved 2 objects"));
}
