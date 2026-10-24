use crate::{
    model::ComponentId,
    workspace::{
        binding_prefix_by_default_scope, by_root_dir_and_name, component_package_name, glob,
    },
};
use pretty_assertions::assert_eq;
use serde_json::{Map, Value, json};

fn variants(value: &Value) -> Vec<(String, Map<String, Value>)> {
    value
        .as_object()
        .unwrap()
        .iter()
        .map(|(key, value)| (key.clone(), value.as_object().unwrap().clone()))
        .collect()
}

#[test]
fn variants_sort_by_specificity_and_stop_propagation() {
    let variants = variants(&json!({
        "*": { "a": { "from": "star" }, "defaultScope": "org.star" },
        "comps": { "a": { "from": "comps" }, "b": {} },
        "comps/ui": { "c": {}, "propagate": false },
        "comps/ui, !comps/ui/excluded": { "d": {} },
        "{ui/**}": { "e": {} },
    }));
    let matched = by_root_dir_and_name(&variants, "comps/ui/button", "ui/button").unwrap();
    let keys: Vec<Vec<&str>> = matched.extensions
        .iter()
        .map(|map| map.keys().map(String::as_str).collect())
        .collect();
    // `comps/ui` and its comma variant tie at 2: the later one sorts first.
    assert_eq!(keys, [vec!["d"], vec!["c"]]);
    assert!(!matched.propagate);
    assert!((matched.max_specificity - 2.0).abs() < f64::EPSILON);
    // the default scope is taken from every match, even after propagation stopped.
    assert_eq!(matched.default_scope.as_deref(), Some("org.star"));

    let excluded = by_root_dir_and_name(&variants, "comps/ui/excluded", "ui/excluded").unwrap();
    assert_eq!(excluded.extensions[0].keys().collect::<Vec<_>>(), ["c"]);

    let other = by_root_dir_and_name(&variants, "lib/x", "x").unwrap();
    assert_eq!(other.extensions.len(), 1);
    assert_eq!(other.default_scope.as_deref(), Some("org.star"));
    assert!(other.max_specificity.abs() < f64::EPSILON);

    let namespaced = by_root_dir_and_name(&variants, "elsewhere", "ui/card").unwrap();
    assert_eq!(namespaced.extensions[0].keys().collect::<Vec<_>>(), ["e"]);
    assert!((namespaced.max_specificity - 1.05).abs() < f64::EPSILON);
}

#[test]
fn dir_variants_reject_globs_and_match_whole_segments() {
    let bad = variants(&json!({ "comps/*": {} }));
    assert!(by_root_dir_and_name(&bad, "comps/a", "a").is_err());
    let dirs = variants(&json!({ "comp": { "a": {} } }));
    assert!(by_root_dir_and_name(&dirs, "comps/a", "a").unwrap().extensions.is_empty());
    assert_eq!(by_root_dir_and_name(&dirs, "comp/", "a").unwrap().extensions.len(), 1);
}

#[test]
fn glob_subset() {
    assert!(glob::matches("ui/*", "ui/button"));
    assert!(!glob::matches("ui/*", "ui/a/b"));
    assert!(glob::matches("ui/**", "ui/a/b"));
    assert!(glob::matches("**/button", "ui/button"));
    assert!(glob::matches("ui/b?tton", "ui/button"));
    assert!(glob::matches("ui/[a-c]*", "ui/button"));
    assert!(!glob::matches("ui/[!a-c]*", "ui/button"));
    assert!(glob::matches("{ui,lib}/x", "lib/x"));
    assert!(!glob::matches("*", ".hidden"));
}

fn id(scope: Option<&str>, default_scope: Option<&str>, name: &str) -> ComponentId {
    ComponentId {
        scope: scope.map(str::to_owned),
        default_scope: default_scope.map(str::to_owned),
        name: name.to_owned(),
        version: None,
    }
}

#[test]
fn package_names() {
    assert_eq!(binding_prefix_by_default_scope("teambit.react"), "@teambit");
    assert_eq!(binding_prefix_by_default_scope("local"), "@local");
    let none = Map::new();
    let scoped = id(Some("teambit.react"), None, "ui/button");
    assert_eq!(component_package_name(&scoped, None, &none), "@teambit/react.ui.button");
    let new = id(None, Some("my-scope"), "button");
    assert_eq!(component_package_name(&new, None, &none), "@my-scope/button");
    assert_eq!(
        component_package_name(&scoped, Some("@bit"), &none),
        "@bit/teambit.react.ui.button",
    );
    assert_eq!(
        component_package_name(&scoped, Some("@other"), &none),
        "@other/teambit.react.ui.button",
    );
    let pkg = json!({ "teambit.pkg/pkg": { "packageJson": { "name": "@{owner}/{scope}--{name}{{x}}" } } });
    assert_eq!(
        component_package_name(&scoped, None, pkg.as_object().unwrap()),
        "@teambit/react--ui.button{x}",
    );
}
