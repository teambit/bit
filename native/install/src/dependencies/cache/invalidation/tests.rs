//! Unit tests for dependency cache invalidation ([`invalidate`], [`needs_invalidation`], [`deps_dir`]) based on workspace modification
//! timestamps in `bit-install`.

use super::{deps_dir, invalidate, needs_invalidation};
use crate::dependencies::cache::put;
use pretty_assertions::assert_eq;
use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime},
};

/// Writes `{}` to `path` and sets its modification timestamp to `time` ([`Path`], [`SystemTime`], [`needs_invalidation`]).
fn touch(path: &Path, time: SystemTime) {
    fs::write(path, "{}").expect("write");
    fs::File::options()
        .write(true)
        .open(path)
        .expect("open")
        .set_modified(time)
        .expect("mtime");
}

/// Verifies that an empty dependency cache directory ([`deps_dir`]) does not require invalidation ([`needs_invalidation`]).
#[test]
fn an_empty_cache_needs_no_invalidation() {
    let temp = tempfile::tempdir().expect("tempdir");
    touch(&temp.path().join(".bitmap"), SystemTime::now());
    assert!(!needs_invalidation(temp.path(), &deps_dir(temp.path())).expect("check"));
}

/// Verifies that workspace file modifications older than the oldest cache entry preserve the dependency cache.
#[test]
fn workspace_changes_before_the_oldest_entry_keep_the_cache() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    touch(&root.join(".bitmap"), SystemTime::now() - Duration::from_hours(1));
    put(&deps_dir(root), "acme/button", "{}").expect("put");
    assert_eq!(invalidate(root, &deps_dir(root)).expect("invalidate"), false);
    assert!(deps_dir(root).exists());
}

/// Verifies that a workspace file modification newer than the oldest cache entry drops the dependency cache.
#[test]
fn a_workspace_change_after_the_oldest_entry_drops_the_cache() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    put(&deps_dir(root), "acme/button", "{}").expect("put");
    for name in [".bitmap", "workspace.jsonc", "package.json", "pnpm-lock.yaml"] {
        touch(&root.join(name), SystemTime::now() - Duration::from_hours(1));
    }
    touch(&root.join(".bitmap"), SystemTime::now() + Duration::from_hours(1));
    assert_eq!(invalidate(root, &deps_dir(root)).expect("invalidate"), true);
    assert!(!deps_dir(root).exists());
}
