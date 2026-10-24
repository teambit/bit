//! Core aspects retain dependency-tree grouping and per-origin uniqueness.
use super::{Resolver, io};
use crate::model::WorkspaceComponent;
use std::path::{Path, PathBuf};

pub(super) struct Import {
    component: bool,
    path: String,
    id: String,
}

pub(super) fn import(
    resolver: &mut Resolver<'_>,
    component: &WorkspaceComponent,
    specifier: &str,
    lookup: Option<&Option<PathBuf>>,
    id: String,
) -> io::Result<Import> {
    let name = super::super::resolve::package_name(specifier);
    let (is_component, package) = resolver.core_metadata(&component.dir, &name)?;
    let path = lookup.and_then(Option::as_deref).unwrap_or(&package);
    Ok(Import { component: is_component, path: relative(&component.dir, path), id })
}

pub(super) fn ordered(imports: &mut [Import]) -> Vec<String> {
    imports.sort_by(|left, right| {
        left.component
            .cmp(&right.component)
            .then_with(|| left.path.encode_utf16().cmp(right.path.encode_utf16()))
    });
    let mut ids = Vec::new();
    for import in imports {
        if !ids.contains(&import.id) {
            ids.push(import.id.clone());
        }
    }
    ids
}

fn relative(from: &Path, to: &Path) -> String {
    let from: Vec<_> = from.components().collect();
    let to: Vec<_> = to.components().collect();
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();
    let mut path = PathBuf::new();
    for _ in common..from.len() {
        path.push("..");
    }
    for component in &to[common..] {
        path.push(component.as_os_str());
    }
    path.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/")
}
