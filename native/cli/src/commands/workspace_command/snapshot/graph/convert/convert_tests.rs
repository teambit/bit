use super::{
    super::replacer::{Replacer, WorkspaceComponent},
    convert, ref_to_relative,
};
use serde_json::{Value, json};

#[test]
fn references_resolve_like_ref_to_relative() {
    assert_eq!(ref_to_relative("link:../a", "a"), None);
    assert_eq!(ref_to_relative("1.0.0", "a").as_deref(), Some("a@1.0.0"));
    assert_eq!(ref_to_relative("@scope/b@2.0.0", "a").as_deref(), Some("@scope/b@2.0.0"));
    assert_eq!(ref_to_relative("b@2.0.0", "a").as_deref(), Some("b@2.0.0"));
    assert_eq!(
        ref_to_relative("1.0.0(react@18.0.0)", "a").as_deref(),
        Some("a@1.0.0(react@18.0.0)"),
    );
    assert_eq!(ref_to_relative("file:comps/one", "a").as_deref(), Some("a@file:comps/one"));
}

const HASH: &str = "0123456789abcdef0123456789abcdef01234567";

fn replacer() -> Replacer {
    Replacer::new(&[
        WorkspaceComponent { package_name: "@s/one", identity: "s/one", version: Some(HASH) },
        WorkspaceComponent { package_name: "@s/two", identity: "s/two", version: Some("1.0.0") },
    ])
    .unwrap()
}

fn lockfile() -> serde_json::Map<String, Value> {
    let value = json!({
        "importers": {
            "comps/one": { "devDependencies": { "dev": { "specifier": "^1.0.0", "version": "1.0.0" } } },
            "roots": { "dependencies": { "@s/one": { "specifier": "*", "version": "file:comps/one" } } },
        },
        "packages": {
            "dev@1.0.0": { "resolution": { "integrity": "sha512-dev" }, "engines": { "node": ">=8" }, "extra": true },
            "dep@2.0.0": { "resolution": { "integrity": "sha512-dep" } },
            "peer@3.0.0": { "resolution": { "integrity": "sha512-peer" }, "peerDependencies": { "dep": "*" } },
            "@s/one@file:comps/one": { "resolution": { "type": "directory", "directory": "comps/one" } },
        },
        "snapshots": {
            "dev@1.0.0": { "dependencies": { "dep": "2.0.0" } },
            "dep@2.0.0": {},
            "peer@3.0.0(dep@2.0.0)": { "dependencies": { "dep": "2.0.0" }, "transitivePeerDependencies": ["x"] },
            "@s/one@file:comps/one": { "dependencies": { "peer": "3.0.0(dep@2.0.0)" } },
        },
        "pnpmfileChecksum": "bit-1",
    });
    match value {
        Value::Object(map) => map,
        _ => unreachable!(),
    }
}

#[test]
fn a_component_under_an_environment_root() {
    let graph = convert(lockfile(), "comps/one", Some("roots"), "@s/one", &replacer()).unwrap();
    let expected = json!({
        "schemaVersion": "2.0",
        "packages": {
            "dev@1.0.0": { "engines": { "node": ">=8" }, "resolution": { "integrity": "sha512-dev" } },
            "dep@2.0.0": { "resolution": { "integrity": "sha512-dep" } },
            "peer@3.0.0": { "peerDependencies": { "dep": "*" }, "resolution": { "integrity": "sha512-peer" } },
        },
        "edges": [
            { "id": "dev@1.0.0", "neighbours": [{ "id": "dep@2.0.0", "optional": false }] },
            {
                "id": "peer@3.0.0(dep@2.0.0)",
                "neighbours": [{ "id": "dep@2.0.0", "optional": false }],
                "attr": { "pkgId": "peer@3.0.0", "transitivePeerDependencies": ["x"] },
            },
            {
                "id": ".",
                "neighbours": [
                    { "name": "dev", "specifier": "^1.0.0", "id": "dev@1.0.0", "lifecycle": "dev", "optional": false },
                    { "name": "peer", "specifier": "*", "id": "peer@3.0.0(dep@2.0.0)", "lifecycle": "runtime", "optional": false },
                ],
            },
        ],
        "pnpmfileChecksum": "bit-1",
    });
    assert_eq!(serde_json::to_string(&graph).unwrap(), serde_json::to_string(&expected).unwrap());
}

#[test]
fn a_component_without_an_environment_root_uses_its_importer() {
    let graph = convert(lockfile(), "comps/one", None, "@s/one", &replacer()).unwrap();
    let root = graph["edges"]
        .as_array()
        .unwrap()
        .last()
        .unwrap()
        .clone();
    assert_eq!(
        root["neighbours"],
        json!([{ "name": "dev", "specifier": "^1.0.0", "id": "dev@1.0.0", "lifecycle": "dev", "optional": false }]),
    );
    let one = format!("@s/one@0.0.0-{HASH}");
    assert_eq!(graph["packages"][&one], json!({ "component": { "name": "one", "scope": "s" } }));
}

#[test]
fn workspace_components_are_named_by_version_and_unknown_file_packages_dropped() {
    let mut lockfile = lockfile();
    let importer = json!({ "dependencies": {
        "@s/two": { "specifier": "*", "version": "file:comps/two" },
        "local": { "specifier": "file:../local", "version": "file:../local" },
    } });
    lockfile["importers"]["comps/one"] = importer;
    lockfile["packages"]["@s/two@file:comps/two"] =
        json!({ "resolution": { "type": "directory", "directory": "comps/two" } });
    lockfile["packages"]["local@file:../local"] =
        json!({ "resolution": { "type": "directory", "directory": "../local" } });
    lockfile["snapshots"]["@s/two@file:comps/two"] = json!({ "dependencies": { "dep": "2.0.0" } });
    lockfile["snapshots"]["local@file:../local"] = json!({ "dependencies": { "dep": "2.0.0" } });
    let graph = convert(lockfile, "comps/one", None, "@s/one", &replacer()).unwrap();
    assert_eq!(
        graph["packages"]["@s/two@1.0.0"],
        json!({ "component": { "name": "two", "scope": "s" } }),
    );
    assert!(graph["packages"].get("local@file:../local").is_none());
    let edges = graph["edges"].as_array().unwrap();
    assert!(
        edges
            .iter()
            .any(|edge| edge["id"] == "@s/two@1.0.0"),
    );
    assert!(
        edges
            .iter()
            .all(|edge| edge["id"] != "local@file:../local"),
    );
    let root = edges.last().unwrap();
    let ids: Vec<&str> = root["neighbours"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|n| n["id"].as_str())
        .collect();
    assert_eq!(ids, ["@s/two@1.0.0"]);
}
