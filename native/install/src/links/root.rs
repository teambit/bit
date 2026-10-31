//! Links from the workspace to the running bit installation (`dependency-linker.ts`).

#[cfg(test)]
mod tests;

use super::link_fs::{LinkKind, create_link_or_symlink, is_symlink, may_link_target, remove_path};
use crate::{
    host::{CoreAspect, HostInfo},
    model::{DependencyMap, WorkspaceComponent},
};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// The aspect id of bit itself (`aspectLoader.mainAspect`).
const MAIN_ASPECT_ID: &str = "teambit.harmony/bit";
const MAIN_ASPECT_PACKAGE: &str = "@teambit/bit";
const LINK_PREFIX: &str = "link:";

/// The `LinkingOptions` `bit install` passes to `calculateLinks`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LinkOptions {
    /// Link `@teambit/bit` (`linkTeambitBit`, always on for install).
    pub link_teambit_bit: bool,
    /// Link the core aspects (`dependency-resolver.linkCoreAspects`, default `true`).
    pub link_core_aspects: bool,
    /// Create `node_modules/<pkg>` for components with their own `node_modules`
    /// (`linkNestedDepsInNM`: off with root components).
    pub link_nested_deps_in_nm: bool,
}

impl Default for LinkOptions {
    fn default() -> Self {
        Self { link_teambit_bit: true, link_core_aspects: true, link_nested_deps_in_nm: true }
    }
}

/// `calculateLinkedDeps`: `{ package: "link:<abs dir>" }` for `@teambit/bit`, the core aspects
/// the workspace does not author, `@teambit/harmony` and `@teambit/legacy`. The entries go into
/// the root manifest, so the engine creates the links. The dependencies component policies
/// resolve from their env (`resolveFromEnv`) need the merged policies and are added by
/// [`super::resolved_from_env_links`] once those are known.
pub fn linked_root_deps(
    root: &Path,
    info: &HostInfo,
    components: &[WorkspaceComponent],
    options: &LinkOptions,
) -> io::Result<DependencyMap> {
    if options.link_nested_deps_in_nm {
        ensure_nested_package_dirs(root, components)?;
    }
    let ids = workspace_ids(components);
    let bit_repo = is_bit_repo_workspace(root, info);
    let mut links = DependencyMap::new();
    if options.link_teambit_bit
        && !bit_repo
        && let Some(from) = bit_link(root, info, &ids)?
    {
        links.insert(MAIN_ASPECT_PACKAGE.to_owned(), link_value(&from));
    }
    if options.link_core_aspects && !bit_repo {
        core_aspect_links(root, info, &ids, !options.link_teambit_bit, &mut links);
    }
    for package in &info.core_packages {
        links.insert(package.package_name.clone(), link_value(&bvm_or(info, package)));
    }
    Ok(links)
}

/// `linkNonExistingCoreAspects`: the core aspects the workspace does not author.
fn core_aspect_links(
    root: &Path,
    info: &HostInfo,
    ids: &[String],
    has_local_installation: bool,
    links: &mut DependencyMap,
) {
    for aspect in info.core_aspects
        .iter()
        .filter(|aspect| !is_authored(aspect, ids))
    {
        if let Some(from) = core_aspect_link(root, info, aspect, has_local_installation) {
            links.insert(aspect.package_name.clone(), link_value(&from));
        }
    }
}

/// `linkCoreAspectsToHoistedStore`: under the global virtual store, link the root links into
/// pnpm's privately hoisted `node_modules/.pnpm/node_modules`, which store slots resolve through.
/// Call it only when the global virtual store is enabled.
pub fn link_core_aspects_to_hoisted_store(root: &Path, links: &DependencyMap) -> io::Result<()> {
    let hoisted = hoisted_store(root);
    if links.is_empty() || !hoisted.exists() {
        return Ok(());
    }
    for (package, link) in links {
        let dest = hoisted.join("node_modules").join(package);
        create_link_or_symlink(&link_source(link)?, &dest, LinkKind::HardLinkOrSymlink, true)
            .map_err(|error| hoisted_store_error(&hoisted, &error))?;
    }
    Ok(())
}

fn hoisted_store_error(hoisted: &Path, error: &io::Error) -> io::Error {
    let message = format!(
        "failed linking the core aspects into the hoisted store at {}, which packages in the \
         global virtual store rely on to resolve them: {error}",
        hoisted.display(),
    );
    io::Error::new(error.kind(), message)
}

/// `syncCoreAspectLinksForEnvs`, for workspaces that author core aspects (`linkCoreAspects`
/// off): bridge each authored core aspect into `node_modules/.pnpm/node_modules` until its
/// source component is compiled. Returns the warning to print when linking failed.
pub fn sync_core_aspect_links_for_envs(
    root: &Path,
    info: &HostInfo,
    components: &[WorkspaceComponent],
    global_virtual_store: bool,
) -> io::Result<Option<String>> {
    let ids = workspace_ids(components);
    let hoisted = hoisted_store(root);
    let authored: Vec<&CoreAspect> = info.core_aspects
        .iter()
        .filter(|aspect| is_authored(aspect, &ids))
        .collect();
    if authored.is_empty() || !hoisted.exists() {
        return Ok(None);
    }
    let mut links = DependencyMap::new();
    for aspect in authored {
        if let Some(source) = bridge_source(root, info, aspect, global_virtual_store)? {
            links.insert(aspect.package_name.clone(), link_value(&source));
        }
    }
    Ok(link_bridges(&hoisted, &links).err().map(|error| {
        format!("syncCoreAspectLinksForEnvs: failed linking core aspects into the hoisted store. {error}")
    }))
}

/// Where an authored core aspect's bridge points: the workspace copy once compiled (only under
/// the global virtual store; otherwise the bridge is removed), else bit's own copy.
fn bridge_source(
    root: &Path,
    info: &HostInfo,
    aspect: &CoreAspect,
    global_virtual_store: bool,
) -> io::Result<Option<PathBuf>> {
    let workspace_copy = root.join("node_modules").join(&aspect.package_name);
    if !has_compiled_main(&workspace_copy) {
        return Ok(core_aspect_source_dir(info, aspect, root));
    }
    if global_virtual_store {
        return Ok(Some(workspace_copy));
    }
    let link_path = hoisted_store(root).join("node_modules").join(&aspect.package_name);
    remove_bootstrap_link(&link_path, root)?;
    Ok(None)
}

fn link_bridges(hoisted: &Path, links: &DependencyMap) -> io::Result<()> {
    for (package, link) in links {
        let dest = hoisted.join("node_modules").join(package);
        create_link_or_symlink(&link_source(link)?, &dest, LinkKind::HardLinkOrSymlink, true)?;
    }
    Ok(())
}

/// `addSymlinkFromComponentDirNMToWorkspaceDirNM`: its computed nested links are never written;
/// only the `node_modules/<pkg>` directory is created.
fn ensure_nested_package_dirs(root: &Path, components: &[WorkspaceComponent]) -> io::Result<()> {
    for component in components
        .iter()
        .filter(|component| component.root_dir != ".")
    {
        let package_dir = root.join("node_modules").join(&component.package_name);
        if component.dir.join("node_modules").exists() && !is_symlink(&package_dir) {
            fs::create_dir_all(package_dir)?;
        }
    }
    Ok(())
}

/// Component ids without versions, as `linkCoreAspectsAndLegacy` compares them.
fn workspace_ids(components: &[WorkspaceComponent]) -> Vec<String> {
    components
        .iter()
        .map(|component| component.id.to_string_without_version())
        .collect()
}

/// The workspace authors this core aspect. Matches both the full id and the bare name, as
/// TypeScript does while the default scope of a core aspect is unresolved.
fn is_authored(aspect: &CoreAspect, ids: &[String]) -> bool {
    if aspect.id == MAIN_ASPECT_ID {
        return false;
    }
    let name = core_aspect_name(&aspect.id);
    ids.iter()
        .any(|id| *id == name || *id == aspect.id)
}

/// `getCoreAspectName`: `teambit.harmony/envs/core-aspect-env` → `envs.core-aspect-env`.
fn core_aspect_name(id: &str) -> String {
    id.split('/')
        .skip(1)
        .collect::<Vec<_>>()
        .join(".")
}

/// `isBitRepoWorkspace`: the running bit lives inside the workspace (a plain string prefix).
fn is_bit_repo_workspace(root: &Path, info: &HostInfo) -> bool {
    info.bit_dir
        .to_string_lossy()
        .starts_with(&*root.to_string_lossy())
}

/// `linkBitAspectIfNotExist`.
fn bit_link(root: &Path, info: &HostInfo, ids: &[String]) -> io::Result<Option<PathBuf>> {
    if ids
        .iter()
        .any(|id| id == MAIN_ASPECT_ID)
    {
        return Ok(None);
    }
    let target = root.join("node_modules").join(MAIN_ASPECT_PACKAGE);
    if !may_link_target(&target, false) {
        return Ok(None);
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(Some(bvm_package(info, MAIN_ASPECT_PACKAGE).unwrap_or_else(|| info.bit_dir.clone())))
}

/// `linkCoreAspect`. A bvm installation always wins; otherwise an existing non-symlink target
/// is left alone and the directory the host resolved is linked.
fn core_aspect_link(
    root: &Path,
    info: &HostInfo,
    aspect: &CoreAspect,
    has_local_installation: bool,
) -> Option<PathBuf> {
    if let Some(from) = bvm_package(info, &aspect.package_name) {
        return Some(from);
    }
    let target = root.join("node_modules").join(&aspect.package_name);
    may_link_target(&target, has_local_installation).then(|| aspect.dir.clone())
}

pub(super) fn bvm_or(info: &HostInfo, package: &CoreAspect) -> PathBuf {
    bvm_package(info, &package.package_name).unwrap_or_else(|| package.dir.clone())
}

/// `<bvm bit dir>/node_modules/<package>`.
fn bvm_package(info: &HostInfo, package: &str) -> Option<PathBuf> {
    info.bvm_dir
        .as_ref()
        .map(|dir| dir.join("node_modules").join(package))
}

/// `_getCoreAspectSourceDir`: bit's own copy, if compiled and outside the workspace.
fn core_aspect_source_dir(info: &HostInfo, aspect: &CoreAspect, root: &Path) -> Option<PathBuf> {
    let usable = |dir: &Path| has_compiled_main(dir) && !is_inside(dir, root);
    bvm_package(info, &aspect.package_name)
        .filter(|dir| usable(dir))
        .or_else(|| usable(&aspect.dir).then(|| aspect.dir.clone()))
}

/// `hasCompiledMain`: the package's `main` (default `index.js`) exists.
fn has_compiled_main(package_dir: &Path) -> bool {
    let Ok(text) = fs::read_to_string(package_dir.join("package.json")) else { return false };
    let Ok(manifest) = crate::jsonc::parse(&text) else { return false };
    let main = manifest
        .get("main")
        .and_then(|main| main.as_str())
        .filter(|main| !main.is_empty());
    package_dir
        .join(main.unwrap_or("index.js"))
        .exists()
}

/// Real path of `target` is strictly inside the real path of `dir`; `false` when either is missing.
fn is_inside(target: &Path, dir: &Path) -> bool {
    match (fs::canonicalize(target), fs::canonicalize(dir)) {
        (Ok(target), Ok(dir)) => target != dir && target.starts_with(dir),
        _ => false,
    }
}

/// `removeCoreAspectBootstrapLink`: remove a bridge symlink resolving outside the workspace, or a
/// dangling one.
fn remove_bootstrap_link(link_path: &Path, root: &Path) -> io::Result<()> {
    if !is_symlink(link_path) || is_inside(link_path, root) {
        return Ok(());
    }
    remove_path(link_path)
}

fn hoisted_store(root: &Path) -> PathBuf {
    root.join("node_modules").join(".pnpm")
}

pub(super) fn link_value(path: &Path) -> String {
    format!("{LINK_PREFIX}{}", path.display())
}

fn link_source(link: &str) -> io::Result<PathBuf> {
    link.strip_prefix(LINK_PREFIX)
        .map(PathBuf::from)
        .ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, format!("not a link: specifier: {link}"))
        })
}
