use super::{
    graph::merge,
    peers::{split_peer_ids, without_peer_suffix},
};
use serde_json::json;

#[expect(clippy::needless_pass_by_value, reason = "test fixtures read best as json! literals")]
fn graph(packages: serde_json::Value, edges: serde_json::Value) -> serde_json::Value {
    json!({ "schemaVersion": "2.0", "packages": packages, "edges": edges, "pnpmfileChecksum": "bit-1" })
}

#[test]
fn splits_peer_suffixes() {
    assert_eq!(
        split_peer_ids("a@1.0.0(b@2.0.0(c@1.0.0))(d@1.0.0)"),
        ["b@2.0.0(c@1.0.0)", "d@1.0.0"],
    );
    assert_eq!(without_peer_suffix("a@1.0.0(b@2.0.0)"), "a@1.0.0");
    assert!(split_peer_ids("a@1.0.0").is_empty());
}

#[test]
fn merges_direct_dependencies_and_prunes_unreachable_nodes() {
    let mut base = graph(
        json!({ "a@1.0.0": {}, "orphan@1.0.0": {} }),
        json!([
            { "id": ".", "neighbours": [{ "id": "a@1.0.0", "name": "a", "specifier": "*" }] },
            { "id": "orphan@1.0.0", "neighbours": [] }
        ]),
    );
    let incoming = graph(
        json!({ "a@1.1.0": {}, "b@1.0.0": {} }),
        json!([
            { "id": ".", "neighbours": [
                { "id": "a@1.1.0", "name": "a", "specifier": "^1.0.0" },
                { "id": "b@1.0.0", "name": "b", "specifier": "1.0.0" }
            ] }
        ]),
    );
    merge(&mut base, &incoming);
    assert_eq!(
        base["edges"][0]["neighbours"],
        json!([
            { "id": "a@1.1.0", "name": "a", "specifier": "^1.0.0" },
            { "id": "b@1.0.0", "name": "b", "specifier": "1.0.0" }
        ]),
    );
    assert_eq!(base["packages"], json!({ "a@1.1.0": {}, "b@1.0.0": {} }));
    assert_eq!(base["pnpmfileChecksum"], "bit-1");
}

#[test]
fn rewrites_peer_providers_to_the_best_compatible_version() {
    let mut base = graph(
        json!({ "plugin@1.0.0": { "peerDependencies": { "host": "^2.0.0" } }, "host@2.0.0": {} }),
        json!([
            { "id": ".", "neighbours": [{ "id": "plugin@1.0.0(host@2.0.0)", "name": "plugin" }] },
            { "id": "plugin@1.0.0(host@2.0.0)", "attr": { "pkgId": "plugin@1.0.0" }, "neighbours": [{ "id": "host@2.0.0" }] }
        ]),
    );
    let incoming = graph(
        json!({ "host@2.1.0": {} }),
        json!([{ "id": ".", "neighbours": [{ "id": "host@2.1.0", "name": "host" }] }]),
    );
    merge(&mut base, &incoming);
    let ids: Vec<&str> = base["edges"]
        .as_array()
        .unwrap()
        .iter()
        .map(|edge| edge["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, [".", "plugin@1.0.0(host@2.1.0)"]);
    assert_eq!(base["edges"][1]["neighbours"][0]["id"], "host@2.1.0");
}

#[test]
fn best_compatible_peer_includes_prereleases_like_typescript() {
    let mut base = graph(
        json!({ "plugin@1.0.0": { "peerDependencies": { "host": "^2.0.0" } }, "host@2.0.0": {} }),
        json!([
            { "id": ".", "neighbours": [{ "id": "plugin@1.0.0(host@2.0.0)", "name": "plugin" }] },
            { "id": "plugin@1.0.0(host@2.0.0)", "attr": { "pkgId": "plugin@1.0.0" }, "neighbours": [{ "id": "host@2.0.0" }] }
        ]),
    );
    let incoming = graph(
        json!({ "host@2.1.0-beta.1": {} }),
        json!([{ "id": ".", "neighbours": [{ "id": "host@2.1.0-beta.1", "name": "host" }] }]),
    );
    merge(&mut base, &incoming);
    assert_eq!(base["edges"][1]["id"], "plugin@1.0.0(host@2.1.0-beta.1)");
}
