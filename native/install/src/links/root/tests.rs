use super::{
    LinkOptions, link_core_aspects_to_hoisted_store, linked_root_deps,
    sync_core_aspect_links_for_envs,
};
use crate::{
    host::{CoreAspect, HostInfo},
    model::{ComponentId, WorkspaceComponent},
};
use serde_json::Map;
use std::{
    fs,
    path::{Path, PathBuf},
};

fn core(id: &str, package_name: &str, dir: &Path) -> CoreAspect {
    CoreAspect { id: id.into(), package_name: package_name.into(), dir: dir.to_path_buf() }
}

/// A bit installation in `<base>/bit` with one core aspect and the two core packages.
fn host_info(base: &Path) -> HostInfo {
    let modules = base.join("bit/node_modules/@teambit");
    HostInfo {
        bit_dir: modules.join("bit"),
        core_aspects: vec![core("teambit.react/react", "@teambit/react", &modules.join("react"))],
        core_packages: vec![
            core("harmony", "@teambit/harmony", &modules.join("harmony")),
            core("legacy", "@teambit/legacy", &modules.join("legacy")),
        ],
        ..HostInfo::default()
    }
}

fn component(root: &Path, scope: &str, name: &str) -> WorkspaceComponent {
    WorkspaceComponent {
        id: ComponentId {
            scope: Some(scope.into()),
            default_scope: None,
            name: name.into(),
            version: None,
        },
        root_dir: format!("comps/{name}"),
        dir: root.join("comps").join(name),
        files: vec!["index.ts".into()],
        main_file: "index.ts".into(),
        package_name: format!("@{scope}/{name}"),
        env_id: "teambit.harmony/node".into(),
        is_env: false,
        has_package_json: false,
        config: Map::new(),
    }
}

fn link(path: &Path) -> String {
    format!("link:{}", path.display())
}

fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("ws");
    fs::create_dir_all(&root).unwrap();
    (dir, root)
}

#[test]
fn links_bit_core_aspects_and_core_packages_from_the_running_bit() {
    let (dir, root) = workspace();
    let info = host_info(dir.path());
    let links = linked_root_deps(&root, &info, &[], &LinkOptions::default()).unwrap();
    let modules = dir.path().join("bit/node_modules/@teambit");
    let expected: Vec<(&str, String)> = vec![
        ("@teambit/bit", link(&modules.join("bit"))),
        ("@teambit/react", link(&modules.join("react"))),
        ("@teambit/harmony", link(&modules.join("harmony"))),
        ("@teambit/legacy", link(&modules.join("legacy"))),
    ];
    let actual: Vec<(&str, String)> = links
        .iter()
        .map(|(k, v)| (k.as_str(), v.clone()))
        .collect();
    assert_eq!(actual, expected);
    assert!(root.join("node_modules/@teambit").is_dir());
}

#[test]
fn bvm_installation_wins_for_every_link() {
    let (dir, root) = workspace();
    let bvm = dir.path().join("bvm/bit-1.0.0");
    let info = HostInfo { bvm_dir: Some(bvm.clone()), ..host_info(dir.path()) };
    fs::create_dir_all(root.join("node_modules/@teambit/react")).unwrap();
    let links = linked_root_deps(&root, &info, &[], &LinkOptions::default()).unwrap();
    for (name, value) in &links {
        assert_eq!(*value, link(&bvm.join("node_modules").join(name)));
    }
    assert_eq!(links.len(), 4, "bvm links even over an existing directory");
}

#[test]
fn skips_existing_directories_and_authored_aspects() {
    let (dir, root) = workspace();
    let info = host_info(dir.path());
    fs::create_dir_all(root.join("node_modules/@teambit/bit")).unwrap();
    let authored = [component(&root, "teambit.react", "react")];
    let links = linked_root_deps(&root, &info, &authored, &LinkOptions::default()).unwrap();
    let names: Vec<&str> = links
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(names, ["@teambit/harmony", "@teambit/legacy"]);
}

#[test]
fn bit_repo_workspace_links_only_core_packages() {
    let (dir, _) = workspace();
    let info = host_info(dir.path());
    let links = linked_root_deps(dir.path(), &info, &[], &LinkOptions::default()).unwrap();
    let names: Vec<&str> = links
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(names, ["@teambit/harmony", "@teambit/legacy"]);
}

#[test]
fn creates_package_dirs_for_components_with_their_own_node_modules() {
    let (dir, root) = workspace();
    let foo = component(&root, "org.scope", "foo");
    fs::create_dir_all(foo.dir.join("node_modules")).unwrap();
    let bar = component(&root, "org.scope", "bar");
    let info = host_info(dir.path());
    let off = LinkOptions { link_nested_deps_in_nm: false, ..LinkOptions::default() };
    linked_root_deps(&root, &info, &[foo.clone(), bar.clone()], &off).unwrap();
    assert!(!root.join("node_modules/@org.scope/foo").exists());
    linked_root_deps(&root, &info, &[foo, bar], &LinkOptions::default()).unwrap();
    assert!(root.join("node_modules/@org.scope/foo").is_dir());
    assert!(!root.join("node_modules/@org.scope/bar").exists());
}

#[cfg(unix)]
#[test]
fn hoisted_store_links_only_when_the_store_exists() {
    let (dir, root) = workspace();
    let source = dir.path().join("bit/node_modules/@teambit/react");
    fs::create_dir_all(&source).unwrap();
    let mut links = crate::model::DependencyMap::new();
    links.insert("@teambit/react".into(), link(&source));
    link_core_aspects_to_hoisted_store(&root, &links).unwrap();
    assert!(!root.join("node_modules").exists());
    fs::create_dir_all(root.join("node_modules/.pnpm")).unwrap();
    link_core_aspects_to_hoisted_store(&root, &links).unwrap();
    let linked = root.join("node_modules/.pnpm/node_modules/@teambit/react");
    assert_eq!(fs::read_link(linked).unwrap(), source);
}

fn compiled_package(dir: &Path) {
    fs::create_dir_all(dir.join("dist")).unwrap();
    fs::write(dir.join("package.json"), r#"{"main":"dist/index.js"}"#).unwrap();
    fs::write(dir.join("dist/index.js"), "").unwrap();
}

#[cfg(unix)]
#[test]
fn sync_bridges_authored_aspects_until_they_are_compiled() {
    let (dir, root) = workspace();
    let info = host_info(dir.path());
    compiled_package(&dir.path().join("bit/node_modules/@teambit/react"));
    let authored = [component(&root, "teambit.react", "react")];
    assert_eq!(sync_core_aspect_links_for_envs(&root, &info, &authored, false).unwrap(), None);
    fs::create_dir_all(root.join("node_modules/.pnpm")).unwrap();
    sync_core_aspect_links_for_envs(&root, &info, &authored, false).unwrap();
    let bridge = root.join("node_modules/.pnpm/node_modules/@teambit/react");
    assert_eq!(fs::read_link(&bridge).unwrap(), info.core_aspects[0].dir);
    let workspace_copy = root.join("node_modules/@teambit/react");
    compiled_package(&workspace_copy);
    sync_core_aspect_links_for_envs(&root, &info, &authored, true).unwrap();
    assert_eq!(fs::read_link(&bridge).unwrap(), workspace_copy);
    fs::remove_file(&bridge).unwrap();
    std::os::unix::fs::symlink(&info.core_aspects[0].dir, &bridge).unwrap();
    sync_core_aspect_links_for_envs(&root, &info, &authored, false).unwrap();
    assert!(fs::symlink_metadata(&bridge).is_err(), "the bootstrap bridge is removed");
}
