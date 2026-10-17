//! Tracking prepares every package transformer before its first filesystem publication.
use super::{
    ComponentLinkOptions, EnvProps, Host, IndexMap, InjectedDeps, LinkContext, Manifest,
    WorkspaceComponent, is_symlink, package_json, remove_path,
};
use serde_json::Value;
use std::{io, path::Path};

pub(super) async fn prepare(
    components: &[&WorkspaceComponent],
    host: &dyn Host,
    options: &ComponentLinkOptions<'_>,
    injected: &InjectedDeps,
    envs: &IndexMap<String, EnvProps>,
    tracking: bool,
) -> io::Result<IndexMap<String, Manifest>> {
    let mut manifests = IndexMap::new();
    if !tracking {
        return Ok(manifests);
    }
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

pub(super) fn persist(
    root: &Path,
    components: &[&WorkspaceComponent],
    manifests: &IndexMap<String, Manifest>,
) -> io::Result<bool> {
    let mut changed = false;
    for component in components {
        let package = root
            .join("node_modules")
            .join(Path::new(&component.package_name).components().collect::<std::path::PathBuf>());
        if is_symlink(&package) {
            remove_path(&package)?;
        }
        if let Some(manifest) = manifests.get(&component.id.to_string_without_version()) {
            changed |= super::write::tracking(&package.join("package.json"), manifest)?;
        }
    }
    Ok(changed)
}

pub(super) fn version(
    manifest: &mut Manifest,
    component: &WorkspaceComponent,
    package_context: &super::PackageJsonContext<'_>,
) {
    if component.id.version.as_deref() == Some("latest")
        && let Some(id) = manifest.get_mut("componentId").and_then(Value::as_object_mut)
    {
        id.shift_remove("version");
    }
    if component.id.version.is_none() && package_context.props.get("version").is_none() {
        manifest.shift_remove("version");
    }
}
