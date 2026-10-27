//! Copy errors retain the reverse-sorted prefix and roll the backup back for another attempt.
use super::super::{compare, fixture, objects, orphan, tree};
use crate::helper::{Helper, Run};
use std::{collections::BTreeMap, ffi::OsStr, fs, path::Path, time::SystemTime};

type Snapshot = (Option<i32>, String, String, BTreeMap<String, Vec<u8>>);

#[test]
fn restore_directory_conflict_keeps_the_completed_copy_prefix_and_original_backup() {
    for overwrite in [false, true] {
        let helper = fixture();
        let scope = &helper.scopes.remote_path;
        let blocked = orphan(scope);
        let copied = "f".repeat(40);
        objects::write(scope, "Source", &copied, b"copied before the conflict");
        assert!(compare(&helper, "gc", false).status.success());
        assert!(compare(&helper, "gc --dry-run", false).status.success());
        fs::create_dir(objects::path(scope, "objects", &blocked)).unwrap();
        compare_failure(&helper, overwrite, |_| {});
        assert!(objects::path(scope, "objects", &copied).is_file());
        assert!(objects::path(scope, "objects", &blocked).is_dir());
        assert!(objects::path(scope, "deleted-objects", &copied).is_file());
        assert!(objects::path(scope, "deleted-objects", &blocked).is_file());
    }
}

#[test]
fn restore_rejects_identical_files_before_skipping_or_overwriting_them() {
    for overwrite in [false, true] {
        let helper = fixture();
        let scope = &helper.scopes.remote_path;
        let hash = orphan(scope);
        assert!(compare(&helper, "gc", false).status.success());
        assert!(compare(&helper, "gc --dry-run", false).status.success());
        compare_failure(&helper, overwrite, |scope| {
            fs::hard_link(
                objects::path(scope, "deleted-objects", &hash),
                objects::path(scope, "objects", &hash),
            )
            .unwrap();
        });
        assert!(objects::path(scope, "deleted-objects", &hash).is_file());
        assert!(objects::path(scope, "objects", &hash).is_file());
    }
}

fn compare_failure(helper: &Helper, overwrite: bool, prepare: impl Fn(&Path)) {
    let baseline = helper.clone_remote_scope();
    let expected = capture(helper, overwrite, false, &prepare);
    helper.restore_remote_scope(&baseline);
    let actual = capture(helper, overwrite, true, &prepare);
    assert_eq!(actual, expected);
}
fn capture(helper: &Helper, overwrite: bool, native: bool, prepare: &impl Fn(&Path)) -> Snapshot {
    let scope = &helper.scopes.remote_path;
    prepare(scope);
    let before = milliseconds();
    let result = run(helper, overwrite, native);
    let after = milliseconds();
    assert!(!result.status.success(), "{result:?}");
    assert_eq!(result.native, native, "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"), "{result:?}");
    (result.status.code(), result.stdout, project(&result.stderr, before, after), tree(scope))
}
fn run(helper: &Helper, overwrite: bool, native: bool) -> Run {
    let unavailable = helper.scopes.e2e_dir.join("unavailable-runtime");
    let mut environment = vec![("FORCE_COLOR", OsStr::new("1"))];
    if native {
        environment.extend([
            ("BIT_NODE_BINARY", unavailable.as_os_str()),
            ("BIT_NODE_CLI", unavailable.as_os_str()),
        ]);
    } else {
        environment.push(("BIT_NATIVE", OsStr::new("off")));
    }
    let command = if overwrite { "gc --restore-overwrite" } else { "gc --restore" };
    Helper::cmd_in_with(&helper.scopes.remote_path, command, &environment)
}
fn project(stderr: &str, before: u128, after: u128) -> String {
    const PREFIX: &str = "deleted-objects.restoring-";
    let Some((_, rest)) = stderr.split_once(PREFIX) else { return stderr.into() };
    assert_eq!(stderr.matches(PREFIX).count(), 1, "{stderr}");
    let length = rest
        .bytes()
        .take_while(|byte| byte.is_ascii_digit() || *byte == b'-')
        .count();
    let suffix = &rest[..length];
    let fields: Vec<_> = suffix.split('-').collect();
    assert_eq!(fields.len(), 3);
    assert!((before..=after).contains(&fields[0].parse::<u128>().unwrap()));
    assert!(fields[1].parse::<u32>().unwrap() > 0);
    assert_eq!(fields[2], "0");
    stderr.replace(&format!("{PREFIX}{suffix}"), "deleted-objects.restoring-<date>-<pid>-0")
}

fn milliseconds() -> u128 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis()
}
