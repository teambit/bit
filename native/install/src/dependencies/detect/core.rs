//! Core aspects retain dependency-tree grouping and per-origin uniqueness.
//!
//! [`import`] and [`ordered`] sort resolved [`Import`] entries for [`WorkspaceComponent`] by component flag and UTF-16 relative path.
use super::{Resolver, io};
use crate::model::WorkspaceComponent;
use std::path::{Path, PathBuf};

/// Core aspect import entry sorted by component flag and UTF-16 relative path.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Import {
    component: bool,
    path: String,
    id: String,
}

/// Build a core aspect [`Import`] record for `specifier` relative to `component.dir`.
#[inline]
pub(super) fn import(
    resolver: &mut Resolver<'_>,
    component: &WorkspaceComponent,
    specifier: &str,
    lookup: Option<&Option<PathBuf>>,
    id: String,
) -> io::Result<Import> {
    let name = super::super::resolve::package_name(specifier.trim());
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
    let mut ids = Vec::with_capacity(imports.len());
    for import in imports {
        let trimmed = import.id.trim();
        if !trimmed.is_empty()
            && !ids
                .iter()
                .any(|existing| existing == trimmed)
        {
            ids.push(trimmed.to_owned());
        }
    }
    ids
}

#[inline]
fn relative(from: &Path, to: &Path) -> String {
    let from: Vec<_> = from
        .components()
        .filter(|comp| !matches!(comp, std::path::Component::CurDir))
        .collect();
    let to: Vec<_> = to
        .components()
        .filter(|comp| !matches!(comp, std::path::Component::CurDir))
        .collect();
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();
    let mut path = PathBuf::new();
    path.extend(std::iter::repeat_n("..", from.len() - common));
    path.extend(
        to[common..]
            .iter()
            .copied()
            .map(std::path::Component::as_os_str)
            .filter(|part| !part.is_empty()),
    );
    path.to_string_lossy().replace('\\', "/")
}
