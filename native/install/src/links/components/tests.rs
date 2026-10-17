mod tracking;

use super::{ComponentLinkOptions, link_components};
use crate::{
    host::{AfterInstall, AfterInstallResult, Host},
    model::{ComponentId, WorkspaceComponent},
};
use async_trait::async_trait;
use indexmap::IndexMap;
use serde_json::{Map, Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
};

#[derive(Default)]
struct FakeHost {
    calls: Mutex<Vec<String>>,
    transforms: Mutex<Vec<String>>,
    reject: Option<String>,
}

#[async_trait]
impl Host for FakeHost {
    async fn env_policy(&self, _env_id: &str) -> io::Result<Option<Value>> {
        Ok(None)
    }

    async fn app_types(&self) -> io::Result<Vec<String>> {
        Ok(Vec::new())
    }

    async fn package_json_props(&self, component: &str) -> io::Result<Value> {
        self.calls
            .lock()
            .unwrap()
            .push(component.to_owned());
        Ok(
            json!({ "props": { "main": "dist/{main}.js" }, "modifiesPackageJson": self.reject.is_some() }),
        )
    }

    async fn transform_package_json(&self, component: &str, manifest: Value) -> io::Result<Value> {
        self.transforms
            .lock()
            .unwrap()
            .push(component.to_owned());
        if self.reject.as_deref() == Some(component) {
            return Err(io::Error::other("fixture rejected package"));
        }
        Ok(manifest)
    }

    async fn after_install(&self, _request: AfterInstall) -> io::Result<AfterInstallResult> {
        Ok(AfterInstallResult::default())
    }

    async fn confirm(&self, _question: &str) -> io::Result<bool> {
        Ok(false)
    }
}

fn component(root: &Path, name: &str, files: &[&str]) -> WorkspaceComponent {
    WorkspaceComponent {
        id: ComponentId {
            scope: None,
            default_scope: Some("org.scope".into()),
            name: name.into(),
            version: None,
        },
        root_dir: format!("comps/{name}"),
        dir: root.join("comps").join(name),
        files: files
            .iter()
            .map(|file| (*file).to_owned())
            .collect(),
        main_file: "index.ts".into(),
        package_name: format!("@org/scope.{name}"),
        env_id: "teambit.harmony/node".into(),
        is_env: false,
        has_package_json: false,
        config: Map::new(),
    }
}

fn write_sources(component: &WorkspaceComponent) {
    for file in &component.files {
        let path = component.dir.join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, file).unwrap();
    }
}

fn run(
    root: &Path,
    components: &[WorkspaceComponent],
    host: &FakeHost,
    roots: bool,
) -> super::LinkResult {
    run_with(root, components, host, roots, false)
}

fn run_with(
    root: &Path,
    components: &[WorkspaceComponent],
    host: &FakeHost,
    roots: bool,
    windows: bool,
) -> super::LinkResult {
    let dependencies = IndexMap::new();
    let root_components_dir: PathBuf = root.join("node_modules/.bit_roots");
    let options = ComponentLinkOptions {
        has_root_components: roots,
        root_components_dir: &root_components_dir,
        dependencies: &dependencies,
        cloud_domain: "bit.cloud",
        windows,
        aspect_env_ids: &[],
    };
    let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
    runtime
        .block_on(link_components(root, components, host, &options))
        .unwrap()
}

#[cfg(unix)]
#[test]
fn replaces_the_engine_symlink_with_a_linked_package() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let foo = component(root, "foo", &["index.ts", "lib/util.ts"]);
    write_sources(&foo);
    let package_dir = root.join("node_modules/@org/scope.foo");
    fs::create_dir_all(package_dir.parent().unwrap()).unwrap();
    std::os::unix::fs::symlink(&foo.dir, &package_dir).unwrap();
    let host = FakeHost::default();
    let result = run(root, std::slice::from_ref(&foo), &host, false);
    assert!(result.package_json_changed);
    assert!(
        !fs::symlink_metadata(&package_dir)
            .unwrap()
            .file_type()
            .is_symlink(),
    );
    let link = fs::read_link(package_dir.join("lib/util.ts")).unwrap();
    assert_eq!(link, root.join("comps/foo/lib/util.ts"));
    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(package_dir.join("package.json")).unwrap())
            .unwrap();
    assert_eq!(manifest["main"], json!("dist/index.js"));
    assert_eq!(*host.calls.lock().unwrap(), ["teambit.harmony/node"]);
    let again = run(root, &[foo], &host, false);
    assert!(!again.package_json_changed);
    assert!(again.components[0].links.iter().all(|link| link.existed_before));
}

#[cfg(unix)]
#[test]
fn own_package_json_and_workspace_root_component_are_left_alone() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let mut own = component(root, "own", &["index.ts", "package.json"]);
    own.has_package_json = true;
    write_sources(&own);
    let mut workspace_root = component(root, "ws", &["index.ts"]);
    workspace_root.root_dir = ".".into();
    let host = FakeHost::default();
    let result = run(root, &[own, workspace_root], &host, false);
    assert_eq!(result.components.len(), 1);
    assert!(host.calls.lock().unwrap().is_empty());
    let package_json = root.join("node_modules/@org/scope.own/package.json");
    assert!(
        fs::symlink_metadata(package_json)
            .unwrap()
            .file_type()
            .is_symlink(),
    );
}

#[cfg(unix)]
#[test]
fn injected_copies_and_root_components_share_the_package() {
    use std::os::unix::fs::MetadataExt;
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let foo = component(root, "foo", &["index.ts"]);
    write_sources(&foo);
    let injected = "node_modules/.pnpm/file+comps+foo/node_modules/@org/scope.foo";
    let modules = json!({ "injectedDeps": { "node_modules/@org/scope.foo": [injected] } });
    fs::create_dir_all(root.join("node_modules/.bit_roots/env/node_modules")).unwrap();
    fs::write(root.join("node_modules/.modules.yaml"), modules.to_string()).unwrap();
    run(root, std::slice::from_ref(&foo), &FakeHost::default(), true);
    let generated = root.join("node_modules/@org/scope.foo/package.json");
    let ino = |path: &Path| fs::metadata(path).unwrap().ino();
    assert_eq!(ino(&generated), ino(&root.join(injected).join("package.json")));
    let bit_root = root.join("node_modules/.bit_roots/env/node_modules/@org/scope.foo");
    assert_eq!(ino(&generated), ino(&bit_root.join("package.json")));
    assert_eq!(fs::read_to_string(bit_root.join("index.ts")).unwrap(), "index.ts");
}

/// The Windows layout (`IS_WINDOWS` in `NodeModuleLinker`): the component directory is linked
/// as `_src` and `types` points into it. The flag, not the host OS, selects it.
#[test]
fn windows_layout_links_the_source_dir_as_src_and_types_it() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let foo = component(root, "foo", &["index.ts", "lib/util.ts"]);
    write_sources(&foo);
    run_with(root, std::slice::from_ref(&foo), &FakeHost::default(), false, true);
    let package_dir = root.join("node_modules/@org/scope.foo");
    let source = package_dir.join("_src");
    assert_eq!(fs::canonicalize(&source).unwrap(), fs::canonicalize(&foo.dir).unwrap());
    assert_eq!(fs::read_to_string(source.join("lib/util.ts")).unwrap(), "lib/util.ts");
    assert_eq!(fs::read_to_string(package_dir.join("lib/util.ts")).unwrap(), "lib/util.ts");
    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(package_dir.join("package.json")).unwrap())
            .unwrap();
    assert_eq!(manifest["types"], json!("_src/index.ts"));
}

/// pnpm links an injected workspace package as a junction on Windows; linking replaces it
/// with a real directory of per-file links.
#[cfg(windows)]
#[test]
fn replaces_the_engine_junction_with_a_linked_package() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let foo = component(root, "foo", &["index.ts"]);
    write_sources(&foo);
    let package_dir = root.join("node_modules/@org/scope.foo");
    fs::create_dir_all(package_dir.parent().unwrap()).unwrap();
    junction::create(&foo.dir, &package_dir).unwrap();
    run_with(root, std::slice::from_ref(&foo), &FakeHost::default(), false, true);
    assert!(
        !fs::symlink_metadata(&package_dir)
            .unwrap()
            .file_type()
            .is_symlink(),
    );
    assert!(package_dir.join("package.json").is_file());
    assert!(foo.dir.join("index.ts").is_file(), "the junction target is untouched");
    assert!(!foo.dir.join("package.json").exists());
}
