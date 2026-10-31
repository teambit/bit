//! An older tagged dependency is retained through its alias, never through a different scope's name.
use super::{fixture, objects, orphan};
use crate::{commands::move_paths::support, helper::Helper};
use serde_json::json;
use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime},
};

#[test]
fn workspace_collection_keeps_older_dependency_versions_through_legacy_aliases() {
    for boxed in [false, true] {
        let helper = alias_fixture(boxed, "fixture.alias");
        let scope = bit_object_import::scope_path(&helper.scopes.local_path);
        let result = support::compare(&helper, "gc --backup --json");
        assert!(result.status.success(), "{result:?}");
        assert!(!result.trace.contains("starting the JavaScript host"), "{result:?}");
        for identity in
            ["old dependency version", "old dependency source", "current dependency version"]
        {
            assert!(objects::path(&scope, "objects", &objects::digest(identity)).is_file());
        }
    }
}

#[test]
fn workspace_collection_does_not_resolve_a_missing_scope_by_another_models_name() {
    let helper = alias_fixture(false, "fixture.missing");
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let result = support::compare(&helper, "gc --backup");
    assert!(result.status.success(), "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"), "{result:?}");
    let hash = objects::digest("old dependency version");
    assert!(!objects::path(&scope, "objects", &hash).exists());
    assert!(objects::path(&scope, "deleted-objects", &hash).is_file());
}

fn alias_fixture(boxed: bool, requested_scope: &str) -> Helper {
    let helper = fixture();
    objects::alias_graph(&helper, boxed);
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    copy_objects(&helper.scopes.remote_path, &scope);
    let name = if boxed { "legacy/dependency" } else { "dependency" };
    let flattened = json!([format!("{requested_scope}/{name}@0.0.1")]);
    objects::write(
        &scope,
        "Source",
        &objects::digest("flattened dependency source"),
        &serde_json::to_vec(&flattened).unwrap(),
    );
    let remote = scope.join("refs/remotes/fixture.foreign/main");
    fs::create_dir_all(remote.parent().unwrap()).unwrap();
    let refs = json!([{"id":{"scope":"fixture.foreign","name":name},"head":objects::digest("current dependency version")}]);
    fs::write(remote, serde_json::to_vec(&refs).unwrap()).unwrap();
    let orphan = orphan(&scope);
    let mut aged = vec![objects::digest("old dependency version")];
    if requested_scope == "fixture.alias" {
        aged.extend([objects::digest("old dependency source"), orphan]);
    }
    age_objects(&scope, &aged);
    helper
}
fn copy_objects(source: &Path, target: &Path) {
    for bucket in fs::read_dir(source.join("objects")).unwrap() {
        let bucket = bucket.unwrap();
        let directory = target.join("objects").join(bucket.file_name());
        fs::create_dir_all(&directory).unwrap();
        for leaf in fs::read_dir(bucket.path()).unwrap() {
            let leaf = leaf.unwrap();
            fs::copy(leaf.path(), directory.join(leaf.file_name())).unwrap();
        }
    }
}
fn age_objects(scope: &Path, hashes: &[String]) {
    let modified = SystemTime::now() - Duration::from_hours(2);
    for hash in hashes {
        fs::File::open(objects::path(scope, "objects", hash))
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
    }
}
