//! `updateDependenciesVersions`: the version of each component dependency and
//! configured extension, by the canonical strategy order.

use super::{Subject, Workspace, data::Detected, detect::same};
use crate::{
    model::{ComponentId, Lifecycle},
    policy::{
        overrides::{self, FieldMaps, field_index},
        scope::is_hash,
    },
};

/// The overrides views version resolution consults.
pub struct VersionInputs<'a> {
    /// Forced policy entries (`getDependenciesToAddManually`, `-` excluded by the caller).
    pub deps: &'a FieldMaps,
    /// Non-forced policy entries.
    pub auto_detect: &'a FieldMaps,
    /// Non-forced merge-config entries.
    pub merge_config: &'a FieldMaps,
    /// `envOwnPkgNames`: names of the component's own env peers.
    pub env_own: &'a [String],
}

/// Resolve the version of every component dependency of `detected`.
pub fn update(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    inputs: &VersionInputs<'_>,
    detected: &mut Detected,
) {
    for (index, lifecycle) in
        [Lifecycle::Runtime, Lifecycle::Dev, Lifecycle::Peer].iter().enumerate()
    {
        let mut dependencies = std::mem::take(&mut detected.components[index]);
        for dependency in &mut dependencies {
            let package = dependency.package_name.clone();
            if let Some(id) =
                resolve(workspace, subject, inputs, &dependency.id, *lifecycle, package.as_deref())
            {
                dependency.id = id;
            }
        }
        detected.components[index] = dependencies;
    }
}

/// `resolveVersion`: the id of the first strategy that yields one. The `.bitmap`
/// strategy yields the workspace id itself, even without a version (a new component).
pub fn resolve(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    inputs: &VersionInputs<'_>,
    id: &ComponentId,
    lifecycle: Lifecycle,
    package: Option<&str>,
) -> Option<ComponentId> {
    let versioned = |version: Option<String>| {
        version.map(|version| ComponentId { version: Some(version), ..id.clone() })
    };
    let from_package = || id.version.clone();
    let strategies: [&dyn Fn() -> Option<ComponentId>; 8] = [
        &|| versioned(from_overrides(workspace, inputs, id, lifecycle, package?)),
        &|| workspace.bitmap_id(id).cloned(),
        &|| {
            workspace.options.update_dependents
                .iter()
                .find(|dependent| same(dependent, id))
                .filter(|dependent| dependent.version.is_some())
                .cloned()
        },
        &|| {
            versioned(from_package())
                .filter(|_| package.is_some_and(|name| workspace.manifest[0].contains_key(name)))
        },
        &|| versioned(from_merge_config(inputs.merge_config, package?)),
        &|| {
            versioned(from_package())
                .filter(|_| package.is_some_and(|name| in_fields(inputs.auto_detect, name)))
        },
        &|| {
            subject.model
                .components()
                .into_iter()
                .find(|dependency| same(&dependency.id, id))
                .map(|dependency| dependency.id)
                .filter(|found| found.version.is_some())
        },
        &|| versioned(from_package()),
    ];
    strategies.iter().find_map(|strategy| strategy())
}

/// `resolveFromOverrides`: config in `.bitmap` or `component.json`.
fn from_overrides(
    workspace: &Workspace<'_>,
    inputs: &VersionInputs<'_>,
    id: &ComponentId,
    lifecycle: Lifecycle,
    package: &str,
) -> Option<String> {
    if inputs.env_own
        .iter()
        .any(|name| name == package)
        && workspace.bitmap_id(id).is_some()
    {
        return None;
    }
    let found = inputs.deps[field_index(lifecycle)].get(package)?;
    if found == overrides::REMOVE {
        return None;
    }
    valid_component_version(found)
}

fn from_merge_config(merge_config: &FieldMaps, package: &str) -> Option<String> {
    let found = merge_config
        .iter()
        .filter_map(|field| field.get(package))
        .next_back()?;
    valid_component_version(found)
}

fn in_fields(fields: &FieldMaps, name: &str) -> bool {
    fields
        .iter()
        .any(|field| {
            field
                .get(name)
                .is_some_and(|version| !version.is_empty())
        })
}

/// `getValidComponentVersion(version).version`: a snap hash, a semver version, or the
/// coerced version of a range.
#[must_use]
pub fn valid_component_version(version: &str) -> Option<String> {
    let trimmed = version.trim();
    if let Some(hash) = trimmed.strip_prefix("0.0.0-")
        && is_snap(hash)
    {
        return Some(hash.to_owned());
    }
    let normalized = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    if node_semver::Version::parse(normalized).is_ok() {
        return Some(normalized.to_owned());
    }
    if node_semver::Range::parse(trimmed).is_ok()
        && let Some(coerced) = coerce(trimmed)
    {
        return Some(coerced);
    }
    is_snap(trimmed).then(|| trimmed.to_owned())
}

fn is_snap(version: &str) -> bool {
    version.len() == 40 && is_hash(version)
}

/// `semver.coerce`: the first `major[.minor[.patch]]` in the text.
fn coerce(text: &str) -> Option<String> {
    let start = text.find(|character: char| character.is_ascii_digit())?;
    let numbers: Vec<&str> = text[start..]
        .split('.')
        .take(3)
        .map(|part| {
            let end = part
                .find(|character: char| !character.is_ascii_digit())
                .unwrap_or(part.len());
            &part[..end]
        })
        .take_while(|part| !part.is_empty())
        .collect();
    let part = |index: usize| {
        numbers
            .get(index)
            .copied()
            .unwrap_or("0")
    };
    Some(format!("{}.{}.{}", part(0), part(1), part(2)))
}
