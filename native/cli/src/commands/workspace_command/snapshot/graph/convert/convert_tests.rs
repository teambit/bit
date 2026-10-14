use super::{convert, ref_to_relative};
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
    let graph = convert(lockfile(), "comps/one", Some("roots"), "@s/one").unwrap();
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
    let graph = convert(lockfile(), "comps/one", None, "@s/one").unwrap();
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
    assert!(graph["packages"].get("@s/one@file:comps/one").is_some());
}
