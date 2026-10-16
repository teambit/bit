use super::{remove_workspace_package, snapshot_order};
use serde_json::json;

#[test]
fn other_workspace_packages_are_removed_unless_injected_into_the_component() {
    let mut root = json!({
        "dependencies": { "@s/two": { "version": "file:comps/two" }, "lodash": { "version": "4.0.0" } },
        "dependenciesMeta": { "@s/two": { "injected": true } },
    });
    remove_workspace_package(&mut root, "@s/two", false);
    assert_eq!(
        root,
        json!({ "dependencies": { "lodash": { "version": "4.0.0" } }, "dependenciesMeta": {} }),
    );

    let mut own = json!({ "dependencies": { "@s/two": { "version": "file:comps/two" } } });
    remove_workspace_package(&mut own, "@s/two", true);
    assert_eq!(own, json!({ "dependencies": { "@s/two": { "version": "file:comps/two" } } }));

    let mut registry = json!({ "dependencies": { "@s/two": { "version": "1.0.0" } } });
    remove_workspace_package(&mut registry, "@s/two", true);
    assert_eq!(registry, json!({ "dependencies": {} }));
}

#[test]
fn filtered_snapshot_order_follows_pnpm_walker() {
    let lockfile = json!({
        "importers": { "component": { "devDependencies": {
            "a": { "version": "1.0.0" }, "b": { "version": "1.0.0" }
        } } },
        "snapshots": {
            "b@1.0.0": { "dependencies": { "x": "1.0.0" } },
            "y@1.0.0": {},
            "a@1.0.0": { "dependencies": { "x": "1.0.0", "z": "1.0.0", "b": "1.0.0" } },
            "z@1.0.0": {},
            "x@1.0.0": { "dependencies": { "y": "1.0.0" } },
        },
    });
    assert_eq!(
        snapshot_order(&lockfile, &["component".to_string()]),
        ["a@1.0.0", "x@1.0.0", "y@1.0.0", "z@1.0.0", "b@1.0.0"],
    );
}

#[test]
fn component_environment_root_uses_configured_base_and_prefers_unversioned_directory() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let roots = root.join("custom/.bit_roots");
    assert_eq!(
        super::environment_importer(root, &roots, "scope/env@1.2.3").unwrap(),
        "custom/.bit_roots/scope_env@1.2.3",
    );
    std::fs::create_dir_all(roots.join("scope_env")).unwrap();
    assert_eq!(
        super::environment_importer(root, &roots, "scope/env@1.2.3").unwrap(),
        "custom/.bit_roots/scope_env",
    );
}
