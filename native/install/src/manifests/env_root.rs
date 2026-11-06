//! `mergeEnvPeersToRoot`: env peers installed once at the workspace root.
//!
//! Resolves singleton and override environment peer policies into [`EnvRoot`] and injects conflicting peers per env.

use super::{
    ManifestInput,
    semver::{coerce, gt, satisfies, valid_range},
    versions::without_version,
};
use crate::model::DependencyMap;
use indexmap::{IndexMap, IndexSet};

/// Per package: version → envs requiring it, plus the `workspaceSingleton` and `override` flags.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct PeerVersions {
    /// Required version specifier → ordered set of environment IDs requesting it.
    versions: IndexMap<String, IndexSet<String>>,
    /// Whether any environment policy marks this peer as `workspaceSingleton`.
    singleton: bool,
    /// Whether any environment policy marks this peer with `override: true`.
    r#override: bool,
}

/// Merged root environment peers, overrides, per-env conflicts, and console messages.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct EnvRoot {
    /// Env peers for the root manifest (`envSelfPeers.toVersionManifest()`).
    pub(super) peers: DependencyMap,
    /// pnpm overrides from `override: true` peers.
    pub(super) overrides: DependencyMap,
    /// Env id → conflicting peers injected into that env's components.
    pub(super) component_peers: IndexMap<String, DependencyMap>,
    /// `logger.consoleWarning` lines.
    pub(super) warnings: Vec<String>,
    /// `logger.console` lines.
    pub(super) messages: Vec<String>,
}

/// Collect environment peer version requirements ([`PeerVersions`]) in [`super::load_order::load_order`] component order from [`ManifestInput`].
fn collect(input: &ManifestInput<'_>) -> IndexMap<String, PeerVersions> {
    let mut peers: IndexMap<String, PeerVersions> = IndexMap::new();
    for component in super::load_order::load_order(input.components) {
        let env_id = component.env_id.trim();
        let Some(policy) = input.policies.envs
            .get(&component.env_id)
            .or_else(|| input.policies.envs.get(env_id))
        else {
            continue;
        };
        let env = without_version(env_id).to_string();
        for entry in &policy.self_policy {
            let name = entry.name.trim();
            let version = entry.version.trim();
            if name.is_empty()
                || version.is_empty()
                || version == "-"
                || input.components
                    .iter()
                    .any(|local| local.package_name.trim() == name)
            {
                continue;
            }
            let peer = peers.entry(name.to_owned()).or_default();
            peer.versions
                .entry(version.to_owned())
                .or_default()
                .insert(env.clone());
            peer.singleton |= entry.workspace_singleton;
            peer.r#override |= entry.r#override;
        }
    }
    peers
}

/// Count how many environments in `versions` have their required version satisfied ([`satisfies`]) by `candidate` (`coerced`).
#[inline]
fn satisfied_envs(
    candidate: &str,
    coerced: &str,
    versions: &IndexMap<String, IndexSet<String>>,
) -> usize {
    versions
        .iter()
        .filter(|(version, _)| {
            *version == candidate
                || bit_object_import::plus_version::is_plus(version)
                || (valid_range(version).is_some() && satisfies(coerced, version))
        })
        .map(|(_, envs)| envs.len())
        .sum()
}

/// Format a console warning when `best` ([`coerce`]) fails to satisfy every environment's required version in `versions`.
fn conflict_warning(
    name: &str,
    best: &str,
    versions: &IndexMap<String, IndexSet<String>>,
) -> Option<String> {
    let coerced = coerce(best);
    let unsatisfied: Vec<String> = versions
        .iter()
        .filter(|(version, _)| {
            let satisfied = coerced
                .as_deref()
                .is_some_and(|coerced| {
                    valid_range(version).is_some() && satisfies(coerced, version)
                });
            *version != best && !bit_object_import::plus_version::is_plus(version) && !satisfied
        })
        .map(|(version, envs)| {
            format!(
                "{version} ({})",
                envs.iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>()
                    .join(", "),
            )
        })
        .collect();
    (!unsatisfied.is_empty()).then(|| {
        format!(
            r#"Conflicting env peer versions for "{name}": using {best}, but not compatible with: {}"#,
            unsatisfied.join(", "),
        )
    })
}

/// `resolveConflictingPeerVersions`: the version satisfying the most envs, higher on ties.
fn resolve_conflict(
    name: &str,
    versions: &IndexMap<String, IndexSet<String>>,
    warnings: &mut Vec<String>,
) -> String {
    let candidates: Vec<(&String, String)> = versions
        .keys()
        .filter(|version| !bit_object_import::plus_version::is_plus(version))
        .filter_map(|version| Some((version, coerce(version)?)))
        .collect();
    let Some((first_raw, first_coerced)) = candidates.first() else {
        return versions
            .keys()
            .next()
            .cloned()
            .unwrap_or_default();
    };
    let (mut best, mut best_coerced, mut best_count) = (*first_raw, first_coerced.as_str(), 0);
    for (candidate, coerced) in &candidates {
        let count = satisfied_envs(candidate, coerced, versions);
        let higher = gt(coerced, best_coerced).unwrap_or(false);
        if count > best_count || (count == best_count && higher) {
            (best, best_coerced, best_count) = (*candidate, coerced.as_str(), count);
        }
    }
    let best = best.clone();
    warnings.extend(conflict_warning(name, &best, versions));
    best
}

#[inline]
fn hint(package: &str) -> String {
    format!(
        "\n💡 To resolve workspace peer version conflicts, pin a version in workspace.jsonc under \"teambit.dependencies/dependency-resolver\" > \"overrides\", e.g. \"overrides\": {{ \"{package}\": \"<version>\" }}\n",
    )
}

impl EnvRoot {
    #[inline]
    fn add_root(&mut self, name: &str, version: &str, overrides: bool) {
        let (name, version) = (name.trim(), version.trim());
        if name.is_empty() || version.is_empty() {
            return;
        }
        self.peers.insert(name.to_string(), version.to_string());
        if overrides && !bit_object_import::plus_version::is_plus(version) {
            self.overrides.insert(name.to_string(), version.to_string());
        }
    }

    #[inline]
    fn per_component(&mut self, name: &str, versions: &IndexMap<String, IndexSet<String>>) {
        let name = name.trim();
        if name.is_empty() {
            return;
        }
        for (version, envs) in versions
            .iter()
            .filter(|(version, _)| !bit_object_import::plus_version::is_plus(version))
        {
            let version = version.trim();
            if version.is_empty() {
                continue;
            }
            for env in envs {
                self.component_peers
                    .entry(env.clone())
                    .or_default()
                    .insert(name.to_string(), version.to_string());
            }
        }
    }
}

/// `mergeEnvPeersToRoot`, with `forceEnvPeersToRoot` from the options.
pub(super) fn merge(input: &ManifestInput<'_>) -> EnvRoot {
    let mut result = EnvRoot::default();
    let mut conflicting = Vec::new();
    for (name, peer) in collect(input) {
        if peer.versions.len() == 1 {
            let version = peer.versions
                .keys()
                .next()
                .cloned()
                .unwrap_or_default();
            result.add_root(&name, &version, peer.r#override);
            continue;
        }
        if input.options.force_env_peers_to_root || peer.singleton || peer.r#override {
            let chosen = resolve_conflict(&name, &peer.versions, &mut result.warnings);
            result.add_root(&name, &chosen, peer.r#override);
            conflicting.push(name);
        } else {
            result.per_component(&name, &peer.versions);
        }
    }
    if let Some(first) = conflicting.first() {
        result.messages.push(hint(first));
    }
    result
}
