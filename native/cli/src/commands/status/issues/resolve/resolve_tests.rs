use super::{Component, external_vertices, ordinary_heads, versioned};
use serde_json::json;

const HEAD: &str = "0123456789abcdef0123456789abcdef01234567";

fn component(identity: &str, dependencies: &[&str]) -> Component {
    Component {
        identity: identity.to_string(),
        package_name: String::new(),
        dependencies: dependencies
            .iter()
            .map(ToString::to_string)
            .collect(),
        issues: serde_json::Value::Null,
    }
}

#[test]
fn heads_are_proven_per_model() {
    let context = json!({ "models": [{ "scope": "s", "name": "a", "head": HEAD }, { "scope": "s", "name": "b" }] });
    let ordinary = json!([{ "identity": "s/a", "heads": [{ "hash": HEAD, "version": { "extensions": [] } }] }, { "identity": "s/b", "heads": [] }]);
    assert!(ordinary_heads(&context, &ordinary));
    let absent = json!([{ "identity": "s/a", "heads": [{ "hash": HEAD, "version": null }] }, { "identity": "s/b", "heads": [] }]);
    assert!(ordinary_heads(&context, &absent));
    let removed = json!([
        { "identity": "s/a", "heads": [{ "hash": HEAD, "version": { "extensions": [{ "name": "teambit.component/remove" }] } }] },
        { "identity": "s/b", "heads": [] },
    ]);
    assert!(!ordinary_heads(&context, &removed));
    let unproven = json!([{ "identity": "s/a", "heads": [{ "hash": HEAD }] }, { "identity": "s/b", "heads": [] }]);
    assert!(!ordinary_heads(&context, &unproven));
}

#[test]
fn external_vertices_must_cover_exactly_the_reachable_dependencies() {
    let components = [component("s/a@1.0.0", &["s/x@1.0.0"])];
    assert!(external_vertices(&components, None).is_none());
    let graph = json!({ "external": [{ "identity": "s/x@1.0.0", "dependencies": ["s/a@1.0.0"], "model": null }] });
    let external = external_vertices(&components, Some(&graph)).unwrap();
    assert_eq!(external[0].identity, "s/x@1.0.0");
    let extra = json!({ "external": [
        { "identity": "s/x@1.0.0", "dependencies": [], "model": null },
        { "identity": "s/y@1.0.0", "dependencies": [], "model": null },
    ] });
    assert!(external_vertices(&components, Some(&extra)).is_none());
    let alone = [component("s/a@1.0.0", &[])];
    assert_eq!(external_vertices(&alone, None).map(|rows| rows.len()), Some(0));
}

#[test]
fn versioned_identities() {
    assert!(versioned("s/a@1.0.0"));
    assert!(versioned("s.org/ui/button@abc"));
    assert!(!versioned("s/a"));
    assert!(!versioned("a@1.0.0"));
    assert!(!versioned("s/a@1@2"));
}
