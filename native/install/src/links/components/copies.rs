use super::{read_injected_deps, root_component_modules_dirs};
use crate::model::WorkspaceComponent;
use std::{
    io,
    path::{Path, PathBuf},
};

/// `ComponentCompiler.distDirs`: primary package, then injected packages or root projects.
/// Root projects participate even when component root linking is disabled.
pub fn component_package_copies(
    root: &Path,
    component: &WorkspaceComponent,
    root_components: &Path,
) -> io::Result<Vec<PathBuf>> {
    let injected = read_injected_deps(root)?;
    let key = format!("node_modules/{}", component.package_name);
    let mut directories = vec![root.join(&key)];
    if let Some(copies) = injected
        .get(&key)
        .or_else(|| injected.get(&component.root_dir))
        .filter(|copies| !copies.is_empty())
    {
        directories.extend(
            copies
                .iter()
                .map(|path| root.join(path)),
        );
    } else {
        let mut roots = root_component_modules_dirs(root_components)?;
        roots.sort();
        directories.extend(
            roots
                .into_iter()
                .map(|path| path.join(&component.package_name)),
        );
    }
    Ok(directories)
}
