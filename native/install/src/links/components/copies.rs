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
    let pkg_name = component.package_name.trim();
    let key = format!("node_modules/{pkg_name}");
    let mut directories = vec![root.join(&key)];
    if let Some(copies) = injected_copy_paths(&injected, &key, &component.root_dir) {
        directories.extend(
            copies
                .iter()
                .map(|path| path.trim())
                .filter(|path| !path.is_empty())
                .map(|path| root.join(path)),
        );
    } else {
        let mut roots = root_component_modules_dirs(root_components)?;
        roots.sort();
        directories.extend(
            roots
                .into_iter()
                .map(|path| path.join(pkg_name)),
        );
    }
    Ok(directories)
}

fn injected_copy_paths<'a>(
    injected: &'a std::collections::BTreeMap<String, Vec<String>>,
    key: &str,
    root_dir: &str,
) -> Option<&'a [String]> {
    injected
        .get(key)
        .or_else(|| injected.get(root_dir.trim()))
        .map(Vec::as_slice)
        .filter(|copies| !copies.is_empty())
}
