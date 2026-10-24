//! Link a component from a native manifest already prepared by a VCS operation.
use super::{
    ComponentLinks, FileLink, LinkKind, Manifest, SOURCE_DIR, WorkspaceComponent,
    create_link_or_symlink, is_symlink, link_injected_package_json,
    link_packages_to_root_components, plan_file_links, read_injected_deps, remove_path,
    write_package_json,
};
use std::{io, path::Path};

/// Render default package metadata with the ordinary native package transformers.
#[must_use]
pub fn prepared_package_manifest(
    component: &WorkspaceComponent,
    dependencies: &crate::model::ComponentDependencies,
    props: &serde_json::Value,
    cloud_domain: &str,
    is_aspect: bool,
) -> Manifest {
    let context = super::PackageJsonContext {
        dependencies: Some(dependencies),
        cloud_domain,
        props: super::merge_props(Some(props), component),
        windows: cfg!(windows),
        is_aspect,
    };
    super::finish(super::transformed(component, &context), component, &context)
}

/// Apply the ordinary component linker to a native prepared package manifest.
/// `None` keeps a tracked source `package.json`, linked with the other source files.
pub fn link_prepared_component(
    root: &Path,
    component: &WorkspaceComponent,
    manifest: Option<&Manifest>,
    root_components_dir: Option<&Path>,
) -> io::Result<ComponentLinks> {
    if component.root_dir == "." {
        return Ok(ComponentLinks::default());
    }
    let package = root.join("node_modules").join(&component.package_name);
    let (links, existing) = plan_file_links(root, component, &package);
    if is_symlink(&package) {
        remove_path(&package)?;
    }
    if let Some(manifest) = manifest {
        write_package_json(&package.join("package.json"), manifest)?;
    }
    source_links(root, component, &package, &links)?;
    if manifest.is_some() {
        link_injected_package_json(root, component, &package, &read_injected_deps(root)?)?;
    }
    if let Some(directory) = root_components_dir {
        link_packages_to_root_components(directory, root, &[&component.package_name])?;
    }
    Ok(ComponentLinks {
        id: component.id.to_string_without_version(),
        links: [links, existing].concat(),
    })
}

fn source_links(
    root: &Path,
    component: &WorkspaceComponent,
    package: &Path,
    links: &[FileLink],
) -> io::Result<()> {
    for link in links {
        create_link_or_symlink(&link.from, &link.to, LinkKind::Symlink, false)?;
    }
    if cfg!(windows) {
        create_link_or_symlink(
            &root.join(&component.root_dir),
            &package.join(SOURCE_DIR),
            LinkKind::HardLinkOrSymlink,
            false,
        )?;
    }
    Ok(())
}
