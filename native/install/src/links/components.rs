//! `NodeModuleLinker.link()`: workspace components as packages in `node_modules`.

pub use copies::component_package_copies;
pub use prepared::{link_prepared_component, prepared_package_manifest};

mod copies;
mod prepared;
#[cfg(test)]
mod tests;
mod tracking;
mod write;

use write::package as write_package_json;

use super::{
    link_fs::{LinkKind, create_link_or_symlink, hard_link_directory, is_symlink, remove_path},
    package_json::{PackageJsonContext, SOURCE_DIR, finish, transformed},
};
use crate::{
    host::Host,
    model::{ComponentDependencies, Manifest, WorkspaceComponent},
};
use indexmap::IndexMap;
use serde_json::{Map, Value, json};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

/// `injectedDeps` of `node_modules/.modules.yaml`.
type InjectedDeps = BTreeMap<String, Vec<String>>;

/// Inputs of [`link_components`] beyond the components themselves.
#[derive(Debug, Clone, Copy)]
pub struct ComponentLinkOptions<'a> {
    /// `dependency-resolver.rootComponents`: hard link the packages into every `.bit_roots` project.
    pub has_root_components: bool,
    /// Absolute root components dir (`node_modules/.bit_roots` by default).
    pub root_components_dir: &'a Path,
    /// Dependencies by component id without version (`ComponentId::to_string_without_version`).
    pub dependencies: &'a IndexMap<String, ComponentDependencies>,
    /// `getCloudDomain()` (`bit.cloud` by default), for the generated `homepage`.
    pub cloud_domain: &'a str,
    /// Apply the Windows layout: a `_src` link to the component dir and `types` through it.
    pub windows: bool,
    /// Env ids of type `aspect` (their components get `exports.types`).
    pub aspect_env_ids: &'a [String],
}

/// One link of a component file into its package.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileLink {
    pub from: PathBuf,
    pub to: PathBuf,
    /// A symlink was already there and was kept.
    pub existed_before: bool,
}

/// The links of one component.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ComponentLinks {
    pub id: String,
    pub links: Vec<FileLink>,
}

/// What [`link_components`] did.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct LinkResult {
    pub components: Vec<ComponentLinks>,
    /// A generated `package.json` was created or changed: component dependency caches computed
    /// against the old one are stale.
    pub package_json_changed: bool,
}

/// Link every component except the workspace-root one (`rootDir: "."`) into `node_modules`.
/// Components are linked one at a time; the host is asked for package.json props once per
/// component whose manifest Bit generates.
pub async fn link_components(
    root: &Path,
    components: &[WorkspaceComponent],
    host: &dyn Host,
    options: &ComponentLinkOptions<'_>,
) -> io::Result<LinkResult> {
    link_components_with(root, components, host, options, false).await
}

/// Track newly added components without inventing a legacy `latest` version.
pub async fn link_tracking_components(
    root: &Path,
    components: &[WorkspaceComponent],
    host: &dyn Host,
    options: &ComponentLinkOptions<'_>,
) -> io::Result<LinkResult> {
    link_components_with(root, components, host, options, true).await
}

async fn link_components_with(
    root: &Path,
    components: &[WorkspaceComponent],
    host: &dyn Host,
    options: &ComponentLinkOptions<'_>,
    tracking: bool,
) -> io::Result<LinkResult> {
    let components: Vec<_> = components
        .iter()
        .filter(|comp| comp.root_dir != ".")
        .collect();
    let injected = read_injected_deps(root)?;
    let envs = env_props(&components, host).await?;
    let manifests =
        tracking::prepare(&components, host, options, &injected, &envs, tracking).await?;
    let prepared_changes =
        if tracking { tracking::persist(root, &components, &manifests)? } else { false };
    let mut result = LinkResult { package_json_changed: prepared_changes, ..Default::default() };
    for component in &components {
        let context = LinkContext { host, options, injected: &injected, envs: &envs, tracking };
        let (links, changed) = link_component(root, component, &context).await?;
        result.components.push(links);
        result.package_json_changed |= changed;
    }
    if options.has_root_components {
        let names: Vec<&str> = components
            .iter()
            .map(|comp| comp.package_name.as_str())
            .collect();
        link_packages_to_root_components(options.root_components_dir, root, &names)?;
    }
    Ok(result)
}

/// The env `package.json` props of every env whose components get a generated manifest.
async fn env_props(
    components: &[&WorkspaceComponent],
    host: &dyn Host,
) -> io::Result<IndexMap<String, EnvProps>> {
    let mut envs = IndexMap::new();
    for component in components.iter().filter(|component| !component.has_package_json) {
        if envs.contains_key(&component.env_id) {
            continue;
        }
        let response = host.package_json_props(&component.env_id).await?;
        let props = EnvProps {
            props: response
                .get("props")
                .cloned()
                .unwrap_or_else(|| json!({})),
            modifies: response.get("modifiesPackageJson").and_then(Value::as_bool) == Some(true),
        };
        envs.insert(component.env_id.clone(), props);
    }
    Ok(envs)
}

/// `getPackageJsonProps()` of an env and whether it implements `modifyPackageJson()`.
const PKG_ASPECT: &str = "teambit.pkg/pkg";

struct EnvProps {
    props: Value,
    modifies: bool,
}

struct LinkContext<'a> {
    host: &'a dyn Host,
    options: &'a ComponentLinkOptions<'a>,
    injected: &'a InjectedDeps,
    envs: &'a IndexMap<String, EnvProps>,
    tracking: bool,
}

async fn link_component(
    root: &Path,
    component: &WorkspaceComponent,
    context: &LinkContext<'_>,
) -> io::Result<(ComponentLinks, bool)> {
    let LinkContext { options, injected, .. } = *context;
    let package_dir = root
        .join("node_modules")
        .join(Path::new(&component.package_name).components().collect::<std::path::PathBuf>());
    let (new_links, existing) = plan_file_links(root, component, &package_dir);
    if is_symlink(&package_dir) {
        remove_path(&package_dir)?;
    }
    let mut changed = false;
    if !component.has_package_json && !context.tracking {
        let manifest = package_json(component, context).await?;
        changed = write_package_json(&package_dir.join("package.json"), &manifest)?;
    }
    for link in &new_links {
        create_link_or_symlink(&link.from, &link.to, LinkKind::Symlink, false)?;
    }
    if options.windows {
        let source = root.join(&component.root_dir);
        create_link_or_symlink(
            &source,
            &package_dir.join(SOURCE_DIR),
            LinkKind::HardLinkOrSymlink,
            false,
        )?;
    }
    if !component.has_package_json {
        link_injected_package_json(root, component, &package_dir, injected)?;
    }
    let id = component.id.to_string_without_version();
    Ok((ComponentLinks { id, links: [new_links, existing].concat() }, changed))
}

/// `symlinkComponentDir`: one link per `.bitmap` file; existing symlinks are kept.
fn plan_file_links(
    root: &Path,
    component: &WorkspaceComponent,
    package_dir: &Path,
) -> (Vec<FileLink>, Vec<FileLink>) {
    let (mut new_links, mut existing) = (Vec::new(), Vec::new());
    for file in &component.files {
        let from = root.join(&component.root_dir).join(file);
        let to = package_dir.join(file);
        if is_symlink(&to) {
            existing.push(FileLink { from, to, existed_before: true });
        } else {
            new_links.push(FileLink { from, to, existed_before: false });
        }
    }
    (new_links, existing)
}

async fn package_json(
    component: &WorkspaceComponent,
    context: &LinkContext<'_>,
) -> io::Result<Manifest> {
    let options = context.options;
    let env = context.envs.get(&component.env_id);
    let package_context = PackageJsonContext {
        dependencies: options.dependencies.get(&component.id.to_string_without_version()),
        cloud_domain: options.cloud_domain,
        props: merge_props(env.map(|env| &env.props), component),
        windows: options.windows,
        is_aspect: options.aspect_env_ids.iter().any(|env| env_matches(env, &component.env_id)),
    };
    let mut manifest = transformed(component, &package_context);
    if context.tracking {
        tracking::version(&mut manifest, component, &package_context);
    }
    if env.is_some_and(|env| env.modifies) {
        let id = component.id.to_string_without_version();
        let modified = context.host.transform_package_json(&id, Value::Object(manifest)).await?;
        manifest = match modified {
            Value::Object(manifest) => manifest,
            _ => {
                return Err(io::Error::other(format!(
                    "modifyPackageJson of {id} returned no object",
                )));
            }
        };
    }
    Ok(finish(manifest, component, &package_context))
}

/// `mergePackageJsonProps`: the env's props, then the component's `teambit.pkg/pkg`
/// `packageJson` config; `files` arrays concatenate and the dependency keys are dropped.
fn merge_props(env: Option<&Value>, component: &WorkspaceComponent) -> Value {
    let mut merged = Map::new();
    let config = component.config
        .get(PKG_ASPECT)
        .or_else(|| {
            component.config
                .iter()
                .find_map(|(key, value)| {
                    (crate::config::aspect_id_without_version(key) == PKG_ASPECT).then_some(value)
                })
        })
        .and_then(|pkg| pkg.get("packageJson"));
    for props in [env, config].into_iter().flatten() {
        let Value::Object(props) = props else { continue };
        let files: Vec<Value> = [merged.get("files"), props.get("files")]
            .into_iter()
            .flatten()
            .filter_map(Value::as_array)
            .flatten()
            .cloned()
            .collect();
        merged.extend(props.clone());
        if !files.is_empty() {
            merged.insert("files".into(), Value::Array(files));
        }
    }
    for key in ["extensions", "dependencies", "devDependencies", "peerDependencies"] {
        merged.remove(key);
    }
    Value::Object(merged)
}

/// An env id matches with or without the version of the component's env.
fn env_matches(env: &str, component_env: &str) -> bool {
    let (env, component_env) = (env.trim(), component_env.trim());
    component_env == env
        || component_env
            .split_once('@')
            .is_some_and(|(id, _)| id.trim() == env)
}

/// `getInjectedDirs`: each injected copy of the package gets its `package.json` hard linked
/// to the generated one.
fn link_injected_package_json(
    root: &Path,
    component: &WorkspaceComponent,
    package_dir: &Path,
    injected: &InjectedDeps,
) -> io::Result<()> {
    let by_package = injected.get(&format!("node_modules/{}", component.package_name));
    let dirs = by_package.or_else(|| injected.get(&component.root_dir));
    let source = package_dir.join("package.json");
    for dir in dirs.into_iter().flatten() {
        let dest = root.join(dir).join("package.json");
        create_link_or_symlink(&source, &dest, LinkKind::HardLinkOrSymlink, false)?;
    }
    Ok(())
}

fn read_injected_deps(root: &Path) -> io::Result<InjectedDeps> {
    let modules_dir = root.join("node_modules");
    let manifest =
        pnpm_modules_yaml::read_modules_manifest::<pnpm_modules_yaml::Host>(&modules_dir)
            .map_err(|error| io::Error::other(error.to_string()))?;
    Ok(manifest.and_then(|manifest| manifest.injected_deps).unwrap_or_default())
}

/// `linkPkgsToRootComponents`: hard link each package into `<root dir>/node_modules/<pkg>` of
/// every root components dir, leaving the engine's symlinks alone.
fn link_packages_to_root_components(
    root_components_dir: &Path,
    root: &Path,
    names: &[&str],
) -> io::Result<()> {
    let root_dirs = root_component_modules_dirs(root_components_dir)?;
    for name in names {
        let targets: Vec<PathBuf> = root_dirs
            .iter()
            .map(|dir| dir.join(name))
            .filter(|target| !is_symlink(target))
            .collect();
        hard_link_directory(&root.join("node_modules").join(name), &targets)?;
    }
    Ok(())
}

/// `readRootComponentsDir`: `<dir>/node_modules` of each directory under the root components dir.
fn root_component_modules_dirs(root_components_dir: &Path) -> io::Result<Vec<PathBuf>> {
    let entries = match fs::read_dir(root_components_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut dirs = Vec::new();
    for entry in entries {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            dirs.push(entry.path().join("node_modules"));
        }
    }
    Ok(dirs)
}
