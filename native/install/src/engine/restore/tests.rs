use super::{
    convert::{Graph, importer_id, to_lockfile},
    dep_path::parse,
    merge::{drop_unreachable, merge_into_existing, scrub},
    packages_to_resolve,
};
use crate::model::Project;
use pretty_assertions::assert_eq;
use serde_json::{Map, Value, json};
use std::{collections::HashSet, path::Path};

fn object(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(object) => object,
        _ => panic!("expected an object"),
    }
}

fn graph() -> Value {
    json!({
        "schemaVersion": "2.0",
        "pnpmfileChecksum": "bit-1",
        "packages": {
            "a@1.0.0": { "resolution": { "integrity": "sha512-a" }, "requiresBuild": true, "dev": false },
            "b@2.0.0": {},
            "opt@1.0.0": {},
            "comp@0.0.0-snap": { "component": { "scope": "s", "name": "comp" } },
            "orphan@file:comps/x": {}
        },
        "edges": [
            { "id": ".", "neighbours": [
                { "id": "a@1.0.0(b@2.0.0)", "name": "a", "specifier": "^1.0.0" },
                { "id": "gone@1.0.0", "name": "gone", "specifier": "1" }
            ] },
            { "id": "a@1.0.0(b@2.0.0)", "attr": { "pkgId": "a@1.0.0" }, "neighbours": [
                { "id": "b@2.0.0" },
                { "id": "opt@1.0.0", "optional": true }
            ] }
        ]
    })
}

fn root_project() -> Project {
    let manifest =
        object(json!({ "dependencies": { "a": "^1.0.0", "linked": "link:/ws/libs/linked" } }));
    Project { dir: "/ws".into(), manifest }
}

#[test]
fn parses_dependency_paths() {
    let parsed = parse("@s/a@1.0.0(patch_hash=abc)(b@2.0.0)");
    assert_eq!(parsed.name.as_deref(), Some("@s/a"));
    assert_eq!(parsed.version.as_deref(), Some("1.0.0"));
    assert_eq!(parsed.patch_hash.as_deref(), Some("(patch_hash=abc)"));
    assert_eq!(parsed.peer_dep_graph_hash.as_deref(), Some("(b@2.0.0)"));
    assert_eq!(parsed.to_ref(), "1.0.0(patch_hash=abc)(b@2.0.0)");
    assert_eq!(parse("x@file:comps/x").non_semver_version.as_deref(), Some("file:comps/x"));
}

#[test]
fn converts_a_graph_into_a_lockfile() {
    let graph = Graph::parse(&graph()).expect("graph");
    assert!(!graph.packages.contains_key("orphan@file:comps/x"));
    let lockfile = to_lockfile(&graph, &[root_project()], Path::new("/ws"));
    assert!(lockfile.get("pnpmfileChecksum").is_none());
    assert_eq!(lockfile["overrides"], json!({"@teambit/legacy@*":"-","@teambit/harmony@*":"-"}));
    assert_eq!(
        lockfile["snapshots"]["a@1.0.0(b@2.0.0)"],
        json!({
            "dependencies": { "b": "2.0.0" },
            "optionalDependencies": { "opt": "1.0.0" },
        }),
    );
    // Only the lockfile fields of a graph package are kept.
    assert_eq!(
        lockfile["packages"]["a@1.0.0"],
        json!({ "resolution": { "integrity": "sha512-a" } }),
    );
    assert_eq!(
        lockfile["importers"]["."]["dependencies"],
        json!({
            "a": { "version": "1.0.0(b@2.0.0)", "specifier": "^1.0.0" },
            "linked": { "version": "link:libs/linked", "specifier": "link:/ws/libs/linked" },
        }),
    );
    assert_eq!(lockfile["bit"], json!({ "depsRequiringBuild": ["a@1.0.0"] }));
}

#[test]
fn registry_packages_without_resolution_are_resolved_except_workspace_projects() {
    let graph = Graph::parse(&graph()).expect("graph");
    let mut comp = Project {
        dir: "/ws/comp".into(),
        manifest: object(json!({ "name": "comp", "version": "0.0.0-snap" })),
    };
    let lockfile = to_lockfile(&graph, &[root_project(), comp.clone()], Path::new("/ws"));
    let mut names: Vec<_> = packages_to_resolve(&lockfile, &[root_project(), comp.clone()])
        .into_iter()
        .map(|package| package.pkg_id)
        .collect();
    names.sort();
    assert_eq!(names, ["b@2.0.0", "opt@1.0.0"]);
    comp.manifest.insert("version".to_string(), json!("1.0.0"));
    assert_eq!(packages_to_resolve(&lockfile, &[comp]).len(), 3);
}

#[test]
fn drops_unreachable_entries_and_scrubs_packages() {
    let mut lockfile = object(json!({
        "importers": { ".": { "dependencies": { "a": { "version": "1.0.0", "specifier": "1" } } } },
        "packages": { "a@1.0.0": {}, "b@1.0.0": {}, "c@1.0.0": {} },
        "snapshots": { "a@1.0.0": { "dependencies": { "b": "1.0.0" } }, "b@1.0.0": {}, "c@1.0.0": {} },
        "bit": { "depsRequiringBuild": ["b@1.0.0", "c@1.0.0"] }
    }));
    drop_unreachable(&mut lockfile, super::dep_path::remove_suffix);
    assert_eq!(lockfile["packages"], json!({ "a@1.0.0": {}, "b@1.0.0": {} }));
    assert_eq!(lockfile["bit"]["depsRequiringBuild"], json!(["b@1.0.0"]));
    scrub(&mut lockfile, &HashSet::from(["b@1.0.0".to_string()]));
    assert_eq!(lockfile["snapshots"], json!({ "a@1.0.0": {} }));
}

#[test]
fn merges_into_the_existing_lockfile() {
    let existing = object(json!({
        "lockfileVersion": "9.0",
        "pnpmfileChecksum": "bit-0",
        "importers": {
            ".": { "dependencies": { "x": { "version": "1.0.0", "specifier": "1" } } },
            "other": { "dependencies": { "y": { "version": "1.0.0", "specifier": "1" } } }
        },
        "packages": { "x@1.0.0": { "resolution": { "integrity": "sha-x" }, "dev": false }, "y@1.0.0": {}, "stale@1.0.0": {} },
        "snapshots": { "x@1.0.0": {}, "y@1.0.0": {}, "stale@1.0.0": {} },
        "bit": { "depsRequiringBuild": ["y@1.0.0"] }
    }));
    let graph = object(json!({
        "lockfileVersion": "9.0",
        "pnpmfileChecksum": "bit-1",
        "importers": { ".": { "dependencies": { "z": { "version": "1.0.0", "specifier": "1" } } } },
        "packages": { "x@1.0.0": { "resolution": { "integrity": "sha-x2" } }, "z@1.0.0": {} },
        "snapshots": { "z@1.0.0": {} },
        "bit": { "depsRequiringBuild": ["z@1.0.0"] }
    }));
    let merged = merge_into_existing(&existing, &graph);
    assert_eq!(merged.get("pnpmfileChecksum"), None);
    assert_eq!(
        merged["importers"]["."]["dependencies"],
        json!({
            "x": { "version": "1.0.0", "specifier": "1" },
            "z": { "version": "1.0.0", "specifier": "1" },
        }),
    );
    assert_eq!(
        merged["packages"]["x@1.0.0"],
        json!({ "resolution": { "integrity": "sha-x2" }, "dev": false }),
    );
    assert_eq!(merged["packages"].get("stale@1.0.0"), None);
    assert_eq!(merged["bit"]["depsRequiringBuild"], json!(["y@1.0.0", "z@1.0.0"]));
}

#[test]
fn importer_ids_are_posix_relative_paths() {
    assert_eq!(importer_id(Path::new("/ws"), Path::new("/ws")), ".");
    assert_eq!(importer_id(Path::new("/ws"), Path::new("/ws/comps/a")), "comps/a");
}

#[test]
fn rejects_an_unknown_schema() {
    assert!(Graph::parse(&json!({ "schemaVersion": "1.0" })).is_err());
}
