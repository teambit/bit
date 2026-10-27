//! Verbose counts retain repeated lane traversals even when object retention is deduplicated.
use super::{compare, fixture, objects, orphan};
use crate::commands::move_paths::support;
use serde_json::json;

#[test]
fn verbose_bare_collection_counts_shared_lane_versions_and_reports_deleted_sources() {
    let helper = fixture();
    support::setup(&helper, "lane create feature");
    helper.output_file("comp1/index.js", "module.exports=()=> 'lane';\n");
    support::setup(&helper, "snap --skip-tests");
    support::setup(&helper, "export");
    let scope = &helper.scopes.remote_path;
    let mut lane = lane_object(scope);
    lane["name"] = json!("second");
    objects::write(
        scope,
        "Lane",
        &objects::digest("second verbose lane"),
        &serde_json::to_vec(&lane).unwrap(),
    );
    let hash = orphan(scope);
    let baseline = helper.clone_remote_scope();
    for (command, color) in [
        ("gc --verbose --dry-run", false),
        ("gc --verbose --dry-run", true),
        ("gc --verbose --json", false),
        ("gc --verbose", false),
    ] {
        helper.restore_remote_scope(&baseline);
        let result = compare(&helper, command, color);
        assert!(result.status.success(), "{result:?}");
        if !command.contains("--json") {
            assert!(
                result.stdout.contains("total 4 versions, total lanes with this component 2"),
                "{result:?}",
            );
            assert!(result.stdout.contains(&format!("ref {hash} Source Source \n")), "{result:?}");
        }
    }
}

fn lane_object(scope: &std::path::Path) -> serde_json::Value {
    for bucket in std::fs::read_dir(scope.join("objects")).unwrap() {
        let bucket = bucket.unwrap();
        for leaf in std::fs::read_dir(bucket.path()).unwrap() {
            let leaf = leaf.unwrap();
            let hash = format!(
                "{}{}",
                bucket.file_name().to_string_lossy(),
                leaf.file_name().to_string_lossy(),
            );
            let (kind, value) =
                bit_object_import::read_scope_object(scope, &hash).unwrap().unwrap();
            if kind == "Lane" {
                return value;
            }
        }
    }
    panic!("exported lane missing from fixture");
}

#[test]
fn verbose_bare_collection_reports_stored_object_type_identities() {
    let helper = fixture();
    let scope = &helper.scopes.remote_path;
    let model_hash = objects::digest(&format!("{}/comp1", helper.scopes.remote));
    let (_, model) = bit_object_import::read_scope_object(scope, &model_hash).unwrap().unwrap();
    let (_, version) = bit_object_import::read_scope_object(scope, model["head"].as_str().unwrap())
        .unwrap()
        .unwrap();
    let baseline = helper.clone_remote_scope();
    for (kind, value, id) in [
        ("Version", version, ""),
        ("ScopeMeta", json!({"name":"fixture.metadata"}), "fixture.metadata"),
        (
            "Symlink",
            json!({"scope":"fixture.alias","name":"dependency","realScope":"fixture.foreign"}),
            "dependency",
        ),
        (
            "VersionHistory",
            json!({"scope":"fixture.foreign","name":"dependency","versions":[]}),
            "fixture.foreign/dependency:VersionHistory",
        ),
        (
            "LaneHistory",
            json!({"scope":"fixture.foreign","name":"feature","laneHash":"0123456789012345678901234567890123456789","history":{}}),
            "0123456789012345678901234567890123456789:LaneHistory",
        ),
    ] {
        helper.restore_remote_scope(&baseline);
        let hash = objects::digest(&format!("unreachable verbose {kind}"));
        objects::write(scope, kind, &hash, &serde_json::to_vec(&value).unwrap());
        let result = compare(&helper, "gc --verbose --dry-run", false);
        assert!(result.status.success(), "{result:?}");
        assert!(result.stdout.contains(&format!("ref {hash} {kind} {kind} {id}\n")), "{result:?}");
    }
}

#[test]
fn verbose_bare_collection_reports_foreign_lane_history_without_local_lane_counts() {
    let helper = fixture();
    let scope = &helper.scopes.remote_path;
    let previous = objects::digest(&format!("{}/comp1", helper.scopes.remote));
    let (_, mut model) = bit_object_import::read_scope_object(scope, &previous).unwrap().unwrap();
    model["scope"] = json!("fixture.foreign");
    objects::write(
        scope,
        "Component",
        &objects::digest("fixture.foreign/comp1"),
        &serde_json::to_vec(&model).unwrap(),
    );
    std::fs::remove_file(objects::path(scope, "objects", &previous)).unwrap();
    let lane = json!({"name":"feature","scope":helper.scopes.remote,"components":[{"id":{"scope":"fixture.foreign","name":"comp1"},"head":model["head"]}],"log":{}});
    objects::write(
        scope,
        "Lane",
        &objects::digest("foreign verbose lane"),
        &serde_json::to_vec(&lane).unwrap(),
    );
    let unused_history = objects::digest(&format!("{}/comp1:VersionHistory", helper.scopes.remote));
    std::fs::remove_file(objects::path(scope, "objects", &unused_history)).unwrap();
    orphan(scope);
    let result = compare(&helper, "gc --verbose --dry-run", false);
    assert!(result.status.success(), "{result:?}");
    assert!(
        result.stdout.contains("** processing fixture.foreign/comp1 **\n  total 2 versions\n"),
        "{result:?}",
    );
    assert!(!result.stdout.contains("total lanes with this component"), "{result:?}");
}
