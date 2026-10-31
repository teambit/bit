//! `buildLoadGroups`: the order `workspace.list` returns the components in. The
//! manifests keep it (`componentsManifestsMap`), and the env peers resolve their
//! conflicts in it: the version an env lists last wins.

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
    let (envs, configured) = split_envs(components, &extensions);
    let (extended, rest): (Vec<_>, Vec<_>) = others
        .into_iter()
        .partition(|component| configured.contains(full_id(component).as_str()));
    let mut order = core;
    order.extend(env_components(components, &envs));
    order.extend(extended);
    order.extend(rest);
    first_places(order)
}

/// The workspace envs of workspace components, in their layers.
fn env_components<'c>(
    components: &'c [WorkspaceComponent],
    envs: &[&str],
) -> Vec<&'c WorkspaceComponent> {
    env_layers(components, envs, &envs_of(components))
        .into_iter()
        .flatten()
        .filter_map(|id| by_id(components, id))
        .collect()
}

/// Each component at its first place.
fn first_places(mut order: Vec<&WorkspaceComponent>) -> Vec<&WorkspaceComponent> {
    let mut seen = HashSet::new();
    order.retain(|component| seen.insert(full_id(component)));
    order
}

/// The env ids of `components`, versioned when the env is.
fn envs_of(components: &[WorkspaceComponent]) -> HashSet<&str> {
    components
        .iter()
        .map(|component| component.env_id.as_str())
        .collect()
}

/// The extensions that are envs of components, in order, and the other extensions.
fn split_envs<'a>(
    components: &[WorkspaceComponent],
    extensions: &'a [String],
) -> (Vec<&'a str>, HashSet<&'a str>) {
    let envs_of_components = envs_of(components);
    let (envs, configured): (Vec<&str>, Vec<&str>) = extensions
        .iter()
        .map(String::as_str)
        .partition(|id| {
            envs_of_components.contains(id) || envs_of_components.contains(split_version(id).0)
        });
    (envs, configured.into_iter().collect())
}

/// `regroupEnvsIdsFromTheList`: the envs another listed env uses as its env, then the rest.
fn env_layers<'a>(
    components: &[WorkspaceComponent],
    envs: &[&'a str],
    envs_of_components: &HashSet<&str>,
) -> [Vec<&'a str>; 2] {
    let envs_of_envs: HashSet<&str> = envs
        .iter()
        .filter(|id| !envs_of_components.contains(**id))
        .filter_map(|id| by_id(components, id))
        .map(|component| component.env_id.as_str())
        .collect();
    let (first, rest) = envs
        .iter()
        .partition(|id| envs_of_envs.contains(**id) || envs_of_envs.contains(split_version(id).0));
    <[Vec<&str>; 2]>::from((first, rest))
}

/// The configured extensions of `components`, versioned, in order of first appearance.
fn extension_ids(components: &[&WorkspaceComponent]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for component in components {
        for id in component.config.keys() {
            let trimmed = id.trim();
            if !trimmed.is_empty()
                && !ids
                    .iter()
                    .any(|existing| existing == trimmed)
            {
                ids.push(trimmed.to_owned());
            }
        }
    }
    ids
}

fn by_id<'c>(components: &'c [WorkspaceComponent], id: &str) -> Option<&'c WorkspaceComponent> {
    let id = id.trim();
    components
        .iter()
        .find(|component| full_id(component) == id)
}

/// `id.toString()`: the id with its version, when it has one.
fn full_id(component: &WorkspaceComponent) -> String {
    let id = component.id.to_string_without_version();
    match component.id.version.as_deref().map(str::trim) {
        Some(version) if !version.is_empty() => format!("{id}@{version}"),
        _ => id,
    }
}
