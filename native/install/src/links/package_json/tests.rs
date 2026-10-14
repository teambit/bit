use super::{PackageJsonContext, finish, snap_to_semver, transformed};
use crate::model::{
    ComponentDependencies, ComponentDependency, ComponentId, Lifecycle, Manifest,
    PackageDependency, WorkspaceComponent,
};
use serde_json::{Map, Value, json};

fn component(scope: Option<&str>, version: Option<&str>) -> WorkspaceComponent {
    WorkspaceComponent {
        id: ComponentId {
            scope: scope.map(str::to_owned),
            default_scope: Some("org.scope".into()),
            name: "ui/button".into(),
            version: version.map(str::to_owned),
        },
        root_dir: "ui/button".into(),
        dir: "/ws/ui/button".into(),
        files: vec!["index.ts".into()],
        main_file: "index.ts".into(),
        package_name: "@org/scope.ui.button".into(),
        env_id: "teambit.harmony/node".into(),
        is_env: false,
        has_package_json: false,
        config: Map::new(),
    }
}

fn context(props: Value) -> PackageJsonContext<'static> {
    PackageJsonContext {
        dependencies: None,
        cloud_domain: "bit.cloud",
        props,
        windows: false,
        is_aspect: false,
    }
}

fn keys(manifest: &Map<String, Value>) -> Vec<&str> {
    manifest
        .keys()
        .map(String::as_str)
        .collect()
}

#[test]
fn new_component_is_0_0_1_new_without_homepage() {
    let manifest = generate(&component(None, None), &context(Value::Null));
    assert_eq!(manifest["version"], "0.0.1-new");
    assert_eq!(
        keys(&manifest),
        [
            "name",
            "version",
            "main",
            "componentId",
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "license",
            "exported",
            "optionalDependencies",
            "peerDependenciesMeta",
            "_bit_local",
            "source",
        ],
    );
    assert_eq!(manifest["componentId"], json!({ "name": "ui/button", "scope": "org.scope" }));
    assert_eq!(manifest["exported"], json!(false));
    assert_eq!(manifest["license"], json!("SEE LICENSE IN UNLICENSED"));
    assert_eq!(manifest["source"], json!("index.ts"));
}

#[test]
fn exported_snap_gets_homepage_and_semver_version() {
    let hash = "0123456789abcdef0123456789abcdef01234567";
    let manifest = generate(&component(Some("org.scope"), Some(hash)), &context(Value::Null));
    assert_eq!(manifest["version"], json!(format!("0.0.0-{hash}")));
    assert_eq!(manifest["homepage"], json!("https://bit.cloud/org/scope/ui/button"));
    let id = json!({ "scope": "org.scope", "name": "ui/button", "version": hash });
    assert_eq!(manifest["componentId"], id);
    assert_eq!(manifest["exported"], json!(true));
    let latest = generate(&component(Some("org.scope"), Some("latest")), &context(Value::Null));
    assert_eq!(latest["version"], json!("0.0.1-new"));
}

#[test]
fn transformer_props_merge_in_place_and_resolve_placeholders() {
    let props = json!({
        "version": "1.0.0",
        "main": "dist/{main}.js",
        "types": "{main}.ts",
        "description": "{name} of {owner}/{scope} ({scopeId}) {unknown}{{literal}}",
        "exports": { ".": { "default": "./dist/{main}.js" }, "list": ["{name}"] },
    });
    let manifest = generate(&component(None, None), &context(props));
    assert_eq!(keys(&manifest)[1], "version", "keeps the createFromComponent slot");
    assert_eq!(manifest["main"], json!("dist/index.js"));
    assert_eq!(manifest["types"], json!("index.ts"));
    assert_eq!(manifest["description"], json!("ui.button of org/scope (org.scope) {literal}"));
    assert_eq!(manifest["exports"]["."]["default"], json!("./dist/index.js"));
    assert_eq!(manifest["exports"]["list"], json!(["ui.button"]));
}

#[test]
fn type_only_main_drops_js_templates() {
    let mut types_component = component(None, None);
    types_component.main_file = "index.d.ts".into();
    let manifest = generate(&types_component, &context(json!({ "main": "dist/{main}.js" })));
    assert_eq!(manifest["main"], json!(""));
}

#[test]
fn optional_dependencies_and_peer_meta_come_from_the_dependency_list() {
    let package = |name: &str, lifecycle, optional| PackageDependency {
        name: name.into(),
        version: "^1.0.0".into(),
        lifecycle,
        optional,
    };
    let dependency = ComponentDependency {
        id: ComponentId {
            scope: Some("org.scope".into()),
            default_scope: None,
            name: "dep".into(),
            version: Some("abcdef".into()),
        },
        package_name: "@org/scope.dep".into(),
        lifecycle: Lifecycle::Runtime,
        is_extension: false,
        optional: true,
        hidden: false,
    };
    let dependencies = ComponentDependencies {
        packages: vec![
            package("lodash", Lifecycle::Runtime, false),
            package("fsevents", Lifecycle::Runtime, true),
            package("react", Lifecycle::Peer, true),
            package("jest", Lifecycle::Dev, false),
        ],
        components: vec![dependency],
        ..ComponentDependencies::default()
    };
    let context = PackageJsonContext { dependencies: Some(&dependencies), ..context(Value::Null) };
    let manifest = generate(&component(None, None), &context);
    let runtime = json!({ "lodash": "^1.0.0", "fsevents": "^1.0.0" });
    assert_eq!(manifest["dependencies"], runtime);
    assert_eq!(manifest["devDependencies"], json!({ "jest": "^1.0.0" }));
    assert_eq!(manifest["peerDependencies"], json!({ "react": "^1.0.0" }));
    let optional = json!({ "fsevents": "^1.0.0", "@org/scope.dep": "0.0.0-abcdef" });
    assert_eq!(manifest["optionalDependencies"], optional);
    assert_eq!(manifest["peerDependenciesMeta"], json!({ "react": { "optional": true } }));
}

#[test]
fn peer_components_are_marked() {
    let mut peer = component(None, None);
    let config = json!({ "peer": true, "defaultPeerRange": "^" });
    peer.config.insert("teambit.dependencies/dependency-resolver".into(), config);
    let manifest = generate(&peer, &context(Value::Null));
    assert_eq!(manifest["bit"], json!({ "peer": true, "defaultPeerRange": "^" }));
}

#[test]
fn windows_points_types_at_the_source_link() {
    let context = PackageJsonContext { windows: true, ..context(json!({ "types": "x.ts" })) };
    let manifest = generate(&component(None, None), &context);
    assert_eq!(manifest["types"], json!("_src/index.ts"));
}

#[test]
fn aspects_get_exports_types_before_default() {
    let props = json!({
        "types": "{main}.ts",
        "exports": { ".": { "default": "./dist/index.js", "require": "./dist/index.js" } },
    });
    let context = PackageJsonContext { is_aspect: true, ..context(props) };
    let manifest = generate(&component(None, None), &context);
    let exports = manifest["exports"]["."].as_object().unwrap();
    assert_eq!(keys(exports), ["require", "types", "default"]);
    assert_eq!(exports["types"], json!("./index.ts"));
}

#[test]
fn snap_to_semver_only_rewrites_hashes() {
    assert_eq!(snap_to_semver("1.0.0"), "1.0.0");
    assert_eq!(snap_to_semver("abc"), "0.0.0-abc");
    assert_eq!(snap_to_semver("ab"), "ab");
    assert_eq!(snap_to_semver(&"a".repeat(41)), "a".repeat(41));
}

/// The manifest without an env transform.
fn generate(component: &WorkspaceComponent, context: &PackageJsonContext<'_>) -> Manifest {
    finish(transformed(component, context), component, context)
}
