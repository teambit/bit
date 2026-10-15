use super::{Inputs, Restore, check, has_external_links, path, remove, restore, write};
use crate::model::{ComponentId, Project, WorkspaceComponent};
use serde_json::{Map, json};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tempfile::TempDir;

fn component(root: &Path, name: &str) -> WorkspaceComponent {
    WorkspaceComponent {
        id: ComponentId {
            scope: Some("org.scope".into()),
            default_scope: None,
            name: name.into(),
            version: None,
        },
        root_dir: format!("comps/{name}"),
        dir: root.join("comps").join(name),
        files: vec!["index.ts".into()],
        main_file: "index.ts".into(),
        package_name: format!("@org/scope.{name}"),
        env_id: "teambit.harmony/node".into(),
        is_env: false,
        has_package_json: false,
        config: Map::new(),
    }
}

/// A workspace with one compiled component: its sources, its dist and a written stamp.
struct Fixture {
    _dir: TempDir,
    root: PathBuf,
    components: Vec<WorkspaceComponent>,
    dist: PathBuf,
    config: PathBuf,
    stamp: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        fs::write(root.join("workspace.jsonc"), "{}").unwrap();
        fs::write(root.join(".bitmap"), "{}").unwrap();
        fs::write(root.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'").unwrap();
        let components = vec![component(&root, "foo")];
        fs::create_dir_all(&components[0].dir).unwrap();
        fs::write(components[0].dir.join("index.ts"), "export const foo = 1;").unwrap();
        let dist = root.join("node_modules/@org/scope.foo/dist");
        fs::create_dir_all(&dist).unwrap();
        fs::write(dist.join("index.js"), "exports.foo = 1;").unwrap();
        let config = root.join("tsconfig.json");
        fs::write(&config, "// bit-generated-typescript-config").unwrap();
        let stamp = path(&root.join(".bit"));
        let fixture = Self { _dir: dir, root, components, dist, config, stamp };
        let outputs = vec![fixture.dist.clone(), fixture.config.clone()];
        write(&fixture.stamp, &fixture.inputs("1.0.0"), outputs).unwrap();
        fixture
    }

    fn inputs(&self, bit_version: &'static str) -> Inputs<'_> {
        Inputs { root: &self.root, bit_version, components: &self.components }
    }

    fn fresh(&self) -> bool {
        check(&self.stamp, &self.inputs("1.0.0"))
            .unwrap()
            .is_some_and(|restores| restores.is_empty())
    }

    fn component_dir(&self) -> &Path {
        &self.components[0].dir
    }
}

#[test]
fn an_unchanged_workspace_is_fresh() {
    let fixture = Fixture::new();
    assert!(fixture.fresh());
}

#[test]
fn a_changed_or_added_source_file_is_stale() {
    let fixture = Fixture::new();
    fs::write(fixture.component_dir().join("index.ts"), "export const foo = 22;").unwrap();
    assert!(!fixture.fresh());
    let fixture = Fixture::new();
    fs::write(fixture.component_dir().join("other.ts"), "export {};").unwrap();
    assert!(!fixture.fresh(), "the component loader picks up files .bitmap does not list");
}

#[test]
fn a_component_node_modules_dir_is_not_an_input() {
    let fixture = Fixture::new();
    let node_modules = fixture.component_dir().join("node_modules/dep");
    fs::create_dir_all(&node_modules).unwrap();
    fs::write(node_modules.join("index.js"), "").unwrap();
    assert!(fixture.fresh());
}

#[test]
fn changed_configuration_lockfile_or_bit_version_is_stale() {
    for file in ["workspace.jsonc", ".bitmap", "pnpm-lock.yaml"] {
        let fixture = Fixture::new();
        fs::write(fixture.root.join(file), r#"{ "changed": true }"#).unwrap();
        assert!(!fixture.fresh(), "{file}");
    }
    let fixture = Fixture::new();
    assert!(check(&fixture.stamp, &fixture.inputs("1.0.1")).unwrap().is_none());
}

#[test]
fn a_removed_or_changed_dist_is_stale() {
    let fixture = Fixture::new();
    fs::remove_dir_all(&fixture.dist).unwrap();
    assert!(!fixture.fresh());
    let fixture = Fixture::new();
    fs::write(fixture.dist.join("index.js"), "exports.foo = 22;").unwrap();
    assert!(!fixture.fresh());
    let fixture = Fixture::new();
    fs::write(fixture.dist.join("extra.js"), "").unwrap();
    assert!(!fixture.fresh());
}

#[test]
fn a_removed_or_edited_config_file_is_stale() {
    let fixture = Fixture::new();
    fs::remove_file(&fixture.config).unwrap();
    assert!(!fixture.fresh());
    let fixture = Fixture::new();
    fs::write(&fixture.config, r#"{ "compilerOptions": {} }"#).unwrap();
    assert!(!fixture.fresh());
}

#[test]
fn a_dist_rewritten_with_the_same_content_is_fresh() {
    let fixture = Fixture::new();
    let file = fixture.dist.join("index.js");
    std::thread::sleep(std::time::Duration::from_millis(10));
    fs::write(&file, "exports.foo = 1;").unwrap();
    assert!(fixture.fresh(), "an install re-syncs injected copies with the same bytes");
    fs::write(&file, "exports.foo = 2;").unwrap();
    assert!(!fixture.fresh(), "same size, other content");
}

#[test]
fn a_missing_removed_or_unreadable_stamp_is_stale() {
    let fixture = Fixture::new();
    remove(&fixture.stamp);
    assert!(!fixture.fresh());
    remove(&fixture.stamp);
    fs::write(&fixture.stamp, "not json").unwrap();
    assert!(!fixture.fresh());
}

fn project(dir: &Path, dependencies: &serde_json::Value) -> Project {
    let manifest = json!({ "name": "root", "dependencies": dependencies });
    Project { dir: dir.to_path_buf(), manifest: manifest.as_object().unwrap().clone() }
}

#[test]
fn only_links_outside_the_workspace_components_and_bit_are_external() {
    let root = PathBuf::from("/ws");
    let components = vec![component(&root, "foo")];
    let bit_dirs = vec![PathBuf::from("/bit/node_modules/@teambit/react")];
    let external = |dependencies: serde_json::Value| {
        has_external_links(&[project(&root, &dependencies)], &components, &root, &bit_dirs)
    };
    assert!(!external(json!({ "is-odd": "3.0.1", "@org/scope.foo": "link:./comps/foo" })));
    assert!(!external(json!({ "@teambit/react": "link:/bit/node_modules/@teambit/react" })));
    assert!(!external(json!({ "dep": "file:./node_modules/.bit_roots/env/dep" })));
    assert!(external(json!({ "shared": "link:../shared" })));
    assert!(external(json!({ "shared": "file:./packages/shared" })));
    assert!(external(json!({ "escape": "link:./comps/foo/../../../shared" })));
}

#[test]
fn an_injected_dist_dropped_by_the_install_is_restored_from_the_package_dist() {
    let fixture = Fixture::new();
    let injected = fixture.root.join(
        "node_modules/.pnpm/@org+scope.foo@file+comps+foo/node_modules/@org/scope.foo/dist",
    );
    fs::create_dir_all(&injected).unwrap();
    fs::copy(fixture.dist.join("index.js"), injected.join("index.js")).unwrap();
    let outputs = vec![fixture.dist.clone(), injected.clone(), fixture.config.clone()];
    write(&fixture.stamp, &fixture.inputs("1.0.0"), outputs).unwrap();
    fs::remove_dir_all(&injected).unwrap();
    let restores = check(&fixture.stamp, &fixture.inputs("1.0.0")).unwrap().unwrap();
    assert_eq!(
        restores,
        vec![Restore { from: fixture.dist.join("index.js"), to: injected.join("index.js") }],
    );
    restore(&restores).unwrap();
    assert_eq!(fs::read_to_string(injected.join("index.js")).unwrap(), "exports.foo = 1;");
    assert!(
        check(&fixture.stamp, &fixture.inputs("1.0.0"))
            .unwrap()
            .is_some_and(|restores| restores.is_empty()),
    );
    fs::remove_dir_all(&injected).unwrap();
    fs::remove_dir_all(&fixture.dist).unwrap();
    assert!(
        check(&fixture.stamp, &fixture.inputs("1.0.0")).unwrap().is_none(),
        "without an intact copy the step runs",
    );
}
