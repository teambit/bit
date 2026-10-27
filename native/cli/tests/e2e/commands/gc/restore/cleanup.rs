//! Only the validated recovery timestamp and process ID differ between these invocations.
use super::super::{compare, fixture, objects, orphan, tree};
use crate::helper::{Helper, Run};
use std::{
    collections::BTreeMap, ffi::OsStr, fs, os::unix::fs::PermissionsExt, path::Path,
    time::SystemTime,
};

type Snapshot = (Option<i32>, String, String, BTreeMap<String, Vec<u8>>);

#[test]
fn bare_restore_reports_failed_backup_cleanup_and_keeps_the_recovery_directory() {
    for (color, ci) in [(false, false), (true, false), (false, true), (true, true)] {
        let helper = fixture();
        let scope = &helper.scopes.remote_path;
        let hash = orphan(scope);
        assert!(compare(&helper, "gc", false).status.success());
        let baseline = helper.clone_remote_scope();
        let expected = capture(&helper, &baseline, &hash, false, color, ci);
        let actual = capture(&helper, &baseline, &hash, true, color, ci);
        assert_eq!(actual, expected);
        assert!(objects::path(scope, "objects", &hash).is_file());
        assert!(!scope.join("deleted-objects").exists());
    }
}
fn capture(
    helper: &Helper,
    baseline: &Path,
    hash: &str,
    native: bool,
    color: bool,
    ci: bool,
) -> Snapshot {
    helper.restore_remote_scope(baseline);
    let scope = &helper.scopes.remote_path;
    let bucket = scope
        .join("deleted-objects")
        .join(&hash[..2]);
    fs::set_permissions(bucket, fs::Permissions::from_mode(0o555)).unwrap();
    let before = milliseconds();
    let result = run(helper, native, color, ci);
    let after = milliseconds();
    let stage = staging_directory(scope, before, after);
    let state = tree(scope)
        .into_iter()
        .map(|(key, value)| {
            let key = key
                .strip_prefix(&stage)
                .map_or_else(
                    || key.clone(),
                    |suffix| format!("deleted-objects.restoring-<date>-<pid>-0{suffix}"),
                );
            (key, value)
        })
        .collect();
    fs::set_permissions(scope.join(&stage).join(&hash[..2]), fs::Permissions::from_mode(0o755))
        .unwrap();
    assert!(!result.status.success(), "{result:?}");
    assert!(!result.stdout.contains(&stage));
    assert_eq!(result.stderr.matches(&stage).count(), if ci { 3 } else { 1 }, "{result:?}");
    (
        result.status.code(),
        result.stdout,
        result.stderr.replace(&stage, "deleted-objects.restoring-<date>-<pid>-0"),
        state,
    )
}
fn run(helper: &Helper, native: bool, color: bool, ci: bool) -> Run {
    let unavailable = helper.scopes.e2e_dir.join("unavailable-runtime");
    let mut environment = vec![("FORCE_COLOR", OsStr::new(if color { "1" } else { "0" }))];
    if ci {
        environment.push(("CI", OsStr::new("1")));
    }
    if native {
        environment.extend([
            ("BIT_NODE_BINARY", unavailable.as_os_str()),
            ("BIT_NODE_CLI", unavailable.as_os_str()),
        ]);
    } else {
        environment.push(("BIT_NATIVE", OsStr::new("off")));
    }
    let result = Helper::cmd_in_with(&helper.scopes.remote_path, "gc --restore", &environment);
    assert_eq!(result.native, native, "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"), "{result:?}");
    result
}
fn staging_directory(scope: &Path, before: u128, after: u128) -> String {
    let names: Vec<_> = fs::read_dir(scope)
        .unwrap()
        .map(|entry| {
            entry
                .unwrap()
                .file_name()
                .into_string()
                .unwrap()
        })
        .filter(|name| name.starts_with("deleted-objects.restoring-"))
        .collect();
    assert_eq!(names.len(), 1);
    let name = &names[0];
    let fields: Vec<_> = name
        .strip_prefix("deleted-objects.restoring-")
        .unwrap()
        .split('-')
        .collect();
    assert_eq!(fields.len(), 3);
    let time: u128 = fields[0].parse().unwrap();
    assert!((before..=after).contains(&time), "{name} outside {before}..={after}");
    assert!(fields[1].parse::<u32>().unwrap() > 0);
    assert_eq!(fields[2], "0");
    name.clone()
}
fn milliseconds() -> u128 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis()
}
