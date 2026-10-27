//! Workspace collection owns partial failures and restoration without replaying through Node.
use super::{objects, orphan};
use crate::commands::move_paths::support;
use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime},
};

#[test]
fn workspace_collection_and_restore_match_in_text_json_and_ci_modes() {
    for (collect, restore, ci) in [
        ("gc --backup", "gc --restore", false),
        ("gc --backup --json", "gc --restore --json", false),
        ("gc --backup", "gc --restore-overwrite", true),
        ("gc --backup --json", "gc --restore-overwrite --json", true),
    ] {
        let helper = support::workspace(1, true);
        let scope = bit_object_import::scope_path(&helper.scopes.local_path);
        let hash = orphan(&scope);
        old(&objects::path(&scope, "objects", &hash));
        let collected = if ci {
            support::compare_ci(&helper, collect, true)
        } else {
            support::compare(&helper, collect)
        };
        assert!(collected.status.success(), "{collected:?}");
        assert!(!collected.trace.contains("starting the JavaScript host"), "{collected:?}");
        assert!(!objects::path(&scope, "objects", &hash).exists());
        let restored = if ci {
            support::compare_ci(&helper, restore, true)
        } else {
            support::compare(&helper, restore)
        };
        assert!(restored.status.success(), "{restored:?}");
        assert!(!restored.trace.contains("starting the JavaScript host"), "{restored:?}");
        assert!(objects::path(&scope, "objects", &hash).is_file());
        assert!(!scope.join("deleted-objects").exists());
    }
}

#[test]
fn workspace_backup_failure_after_stray_cleanup_is_owned_in_json_and_ci() {
    for (command, ci) in [
        ("gc --backup", false),
        ("gc --backup --json", false),
        ("gc --backup", true),
        ("gc --backup --json", true),
    ] {
        let helper = support::workspace(1, true);
        let scope = bit_object_import::scope_path(&helper.scopes.local_path);
        let hash = orphan(&scope);
        let source = objects::path(&scope, "objects", &hash);
        old(&source);
        let stray = source.with_file_name(format!("{}.12345", &hash[2..]));
        fs::write(&stray, b"interrupted write").unwrap();
        old(&stray);
        fs::write(scope.join("deleted-objects"), b"blocked backup").unwrap();
        let result = if ci {
            support::compare_ci(&helper, command, true)
        } else {
            support::compare(&helper, command)
        };
        assert!(!result.status.success(), "{result:?}");
        assert!(!result.trace.contains("starting the JavaScript host"), "{result:?}");
        assert!(!stray.exists());
        assert!(source.is_file());
    }
}
fn old(path: &Path) {
    let time = SystemTime::now() - Duration::from_hours(2);
    fs::File::open(path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(time))
        .unwrap();
}

#[test]
fn workspace_collection_removes_unreachable_sources_and_their_empty_buckets() {
    for command in ["gc", "gc --json"] {
        let helper = support::workspace(1, true);
        let scope = bit_object_import::scope_path(&helper.scopes.local_path);
        let hash = isolated_source(&scope);
        let source = objects::path(&scope, "objects", &hash);
        old(&source);
        let result = support::compare(&helper, command);
        assert!(result.status.success(), "{result:?}");
        assert!(!result.trace.contains("starting the JavaScript host"), "{result:?}");
        assert!(!source.exists());
        assert!(!source.parent().unwrap().exists());
    }
}

fn isolated_source(scope: &Path) -> String {
    for index in 0..1024 {
        let content = format!("isolated unreachable source {index}");
        let hash = objects::digest(&content);
        if !scope
            .join("objects")
            .join(&hash[..2])
            .exists()
        {
            objects::write(scope, "Source", &hash, content.as_bytes());
            return hash;
        }
    }
    panic!("fixture has no available source bucket");
}

#[test]
fn workspace_recovery_declines_missing_ci_backup_before_mutation() {
    let helper = support::workspace(1, true);
    let result = support::compare_ci(&helper, "gc --restore", false);
    assert!(!result.status.success(), "{result:?}");
    assert!(
        result.trace.contains("missing recovery backup requires released CI diagnostics"),
        "{result:?}",
    );
}

#[test]
fn workspace_collection_declines_legacy_component_aliases_before_cleanup() {
    let helper = support::workspace(1, true);
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let hash = orphan(&scope);
    old(&objects::path(&scope, "objects", &hash));
    let alias = objects::digest("fixture.alias/dependency");
    let value = serde_json::json!({"scope":"fixture.alias","name":"dependency","realScope":"fixture.foreign"});
    objects::write(&scope, "Symlink", &alias, &serde_json::to_vec(&value).unwrap());
    let result = support::compare_declined(&helper, "gc --backup", str::to_owned);
    assert!(result.status.success(), "{result:?}");
    assert!(result.trace.contains("legacy workspace component resolution"), "{result:?}");
    assert!(objects::path(&scope, "deleted-objects", &hash).is_file());
}
