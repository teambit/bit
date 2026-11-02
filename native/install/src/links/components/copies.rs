//! Package copy destination resolution for injected and root-component directories.
//!
//! Computes `node_modules/<pkg>` and `.bit_roots` target directories for [`WorkspaceComponent`] compiler artifact mirroring via [`component_package_copies`].

use super::{read_injected_deps, root_component_modules_dirs};
use crate::model::WorkspaceComponent;
use std::{
    io,
    path::{Path, PathBuf},
};

/// `ComponentCompiler.distDirs`: primary package, then injected packages or root projects.
/// Root projects participate even when component root linking is disabled.
#[inline]
pub fn component_package_copies(
    root: &Path,
    component: &WorkspaceComponent,
    root_components: &Path,
) -> io::Result<Vec<PathBuf>> {
    let pkg_name = component.package_name.trim();
    if pkg_name.is_empty() {
        return Ok(Vec::new());
    }
    let injected = read_injected_deps(root)?;
    let key = format!("node_modules/{pkg_name}");
    let mut directories = vec![root.join(&key)];
    let extras: Vec<PathBuf> =
        if let Some(copies) = injected_copy_paths(&injected, &key, &component.root_dir) {
            copies
                .iter()
                .map(String::as_str)
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(|path| root.join(path))
                .collect()
        } else {
            let mut roots = root_component_modules_dirs(root_components)?;
            roots.sort_unstable();
            roots
                .into_iter()
                .map(|path| path.join(pkg_name))
                .collect()
        };
    for dir in extras {
        if !directories.contains(&dir) {
            directories.push(dir);
        }
    }
    Ok(directories)
}

#[inline]
fn injected_copy_paths<'a>(
    injected: &'a std::collections::BTreeMap<String, Vec<String>>,
    key: &str,
    root_dir: &str,
) -> Option<&'a [String]> {
    let trimmed_root = root_dir.trim();
    injected
        .get(key)
        .or_else(|| injected.get(trimmed_root))
        .or_else(|| injected.get(trimmed_root.trim_end_matches(['/', '\\'])))
        .map(Vec::as_slice)
        .filter(|copies| !copies.is_empty())
}
