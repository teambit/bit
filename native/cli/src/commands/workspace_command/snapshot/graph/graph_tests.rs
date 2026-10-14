use super::remove_workspace_package;
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
