//! `buildLoadGroups`: the order `workspace.list` returns the components in. The
//! manifests preserve it (`componentsManifestsMap`), and the env peers resolve their
//! conflicts in it: the version an env lists last wins.
//!
//! Orders core environments, custom workspace environments, configured extensions, and regular [`WorkspaceComponent`]s via [`load_order`].

#[cfg(test)]
mod tests;

use crate::{
    model::WorkspaceComponent,
    policy::{is_core_env, split_version},
};
use std::collections::HashSet;

/// Core envs first, then the workspace envs of workspace components (envs of those
/// envs first), then the components another component configures as an extension,
/// then the rest. Within a group the components keep their `.bitmap` order, the
/// envs their configuration order; a component keeps its first place.
pub(super) fn load_order(components: &[WorkspaceComponent]) -> Vec<&WorkspaceComponent> {
    let (core, others): (Vec<_>, Vec<_>) = components
        .iter()
        .partition(|component| is_core_env(&component.id.to_string_without_version()));
    let extensions = extension_ids(&others);
    let envs_of_components = envs_of(components);
    let (envs, configured) = split_envs(&envs_of_components, &extensions);
    let (extended, rest): (Vec<_>, Vec<_>) = others
        .into_iter()
        .partition(|component| configured.contains(full_id(component).as_str()));
    let mut order = core;
    order.extend(env_components(components, &envs, &envs_of_components));
    order.extend(extended);
    order.extend(rest);
    first_places(order)
}

/// The workspace envs of workspace components, in their layers.
#[inline]
fn env_components<'c>(
    components: &'c [WorkspaceComponent],
    envs: &[&str],
    envs_of_components: &HashSet<&str>,
) -> Vec<&'c WorkspaceComponent> {
    env_layers(components, envs, envs_of_components)
        .into_iter()
        .flatten()
        .filter_map(|id| by_id(components, id))
        .collect()
}

/// Retain only the first occurrence of each component in `order`.
#[inline]
fn first_places(mut order: Vec<&WorkspaceComponent>) -> Vec<&WorkspaceComponent> {
    let mut seen = HashSet::with_capacity(order.len());
    order.retain(|component| seen.insert(full_id(component)));
    order
}

/// The env ids of `components`, versioned when the env is.
#[inline]
fn envs_of(components: &[WorkspaceComponent]) -> HashSet<&str> {
    components
        .iter()
        .map(|component| component.env_id.trim())
        .filter(|env| !env.is_empty())
        .collect()
}

/// The extensions that are envs of components, in order, and the other extensions.
fn split_envs<'a>(
    envs_of_components: &HashSet<&str>,
    extensions: &'a [String],
) -> (Vec<&'a str>, HashSet<&'a str>) {
    let (envs, configured): (Vec<&str>, Vec<&str>) = extensions
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .filter(|ext| !ext.is_empty())
        .partition(|id| {
            envs_of_components.contains(id) || envs_of_components.contains(split_version(id).0)
        });
    (envs, configured.into_iter().collect())
}

/// Partition `envs` into environments used as the environment of another listed environment, followed by the rest (`regroupEnvsIdsFromTheList`).
fn env_layers<'a>(
    components: &[WorkspaceComponent],
    envs: &[&'a str],
    envs_of_components: &HashSet<&str>,
) -> [Vec<&'a str>; 2] {
    let envs_of_envs: HashSet<&str> = envs
        .iter()
        .filter(|id| !envs_of_components.contains(**id))
        .filter_map(|id| by_id(components, id))
        .map(|component| component.env_id.trim())
        .filter(|id| !id.is_empty())
        .collect();
    let (first, rest) = envs
        .iter()
        .partition(|id| envs_of_envs.contains(**id) || envs_of_envs.contains(split_version(id).0));
    <[Vec<&str>; 2]>::from((first, rest))
}

/// The configured extensions of `components`, versioned, in order of first appearance.
fn extension_ids(components: &[&WorkspaceComponent]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    for component in components {
        for id in component.config.keys() {
            let trimmed = id.trim();
            if !trimmed.is_empty() && seen.insert(trimmed) {
                ids.push(trimmed.to_owned());
            }
        }
    }
    ids
}

#[inline]
fn by_id<'c>(components: &'c [WorkspaceComponent], id: &str) -> Option<&'c WorkspaceComponent> {
    let id = id.trim();
    components
        .iter()
        .find(|component| full_id(component) == id)
}

/// `id.toString()`: the id with its version, when it has one.
#[inline]
fn full_id(component: &WorkspaceComponent) -> String {
    let id = component.id.to_string_without_version();
    match component.id.version.as_deref().map(str::trim) {
        Some(version) if !version.is_empty() => format!("{id}@{version}"),
        _ => id,
    }
}
