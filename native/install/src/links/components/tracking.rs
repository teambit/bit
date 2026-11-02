//! Tracking prepares every package transformer before its first filesystem publication.
//!
//! Pre-evaluates [`Host`] package transformers across tracked components via [`prepare`] prior to writing `package.json` files.

use super::{
    ComponentLinkOptions, EnvProps, Host, IndexMap, InjectedDeps, LinkContext, Manifest,
    WorkspaceComponent, is_symlink, package_json, remove_path,
};
use serde_json::Value;
use std::{io, path::Path};

/// Pre-evaluate `package.json` manifests via [`Host`] transformers for tracked components when `tracking` is enabled.
pub(super) async fn prepare(
    components: &[&WorkspaceComponent],
    host: &dyn Host,
    options: &ComponentLinkOptions<'_>,
    injected: &InjectedDeps,
    envs: &IndexMap<String, EnvProps>,
    tracking: bool,
) -> io::Result<IndexMap<String, Manifest>> {
    if !tracking {
        return Ok(IndexMap::new());
    }
    let mut manifests = IndexMap::with_capacity(components.len());
    for component in components {
        if component.has_package_json {
            continue;
        }
        let context = LinkContext { host, options, injected, envs, tracking };
        manifests.insert(
            component.id.to_string_without_version(),
            package_json(component, &context).await?,
        );
    }
    Ok(manifests)
}

/// Persist pre-evaluated `manifests` into `node_modules/<pkg>/package.json` for tracked `components`.
pub(super) fn persist(
    root: &Path,
    components: &[&WorkspaceComponent],
    manifests: &IndexMap<String, Manifest>,
) -> io::Result<bool> {
    let mut changed = false;
    let node_modules = root.join("node_modules");
    for component in components {
        let pkg_name = component.package_name.trim();
        if pkg_name.is_empty() {
            continue;
        }
        let package =
            node_modules.join(Path::new(pkg_name).components().collect::<std::path::PathBuf>());
        if is_symlink(&package) {
            remove_path(&package)?;
        }
        if let Some(manifest) = manifests.get(&component.id.to_string_without_version()) {
            changed |= super::write::tracking(&package.join("package.json"), manifest)?;
        }
    }
    Ok(changed)
}

#[inline]
pub(super) fn version(
    manifest: &mut Manifest,
    component: &WorkspaceComponent,
    package_context: &super::PackageJsonContext<'_>,
) {
    let id_version = component.id.version.as_deref().map(str::trim);
    if id_version.is_some_and(|ver| matches!(ver, "latest" | "head")) {
        strip_component_id_version(manifest);
    }
    if id_version.is_none_or(str::is_empty)
        && package_context.props
            .get("version")
            .and_then(Value::as_str)
            .is_none_or(|ver| ver.trim().is_empty())
    {
        manifest.shift_remove("version");
    }
}

#[inline]
fn strip_component_id_version(manifest: &mut Manifest) {
    let Some(component_id) = manifest.get_mut("componentId") else { return };
    if let Some(id) = component_id.as_object_mut() {
        id.shift_remove("version");
    } else if let Some(text) = component_id.as_str()
        && let Some((base, ver)) = text.trim().rsplit_once('@')
        && matches!(ver.trim(), "latest" | "head")
    {
        *component_id = Value::String(base.trim().to_owned());
    }
}
