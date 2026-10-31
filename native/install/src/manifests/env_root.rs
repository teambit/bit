//! `mergeEnvPeersToRoot`: env peers installed once at the workspace root.

use super::{
    ManifestInput,
    semver::{coerce, gt, satisfies, valid_range},
    versions::without_version,
};
use crate::model::DependencyMap;
use indexmap::{IndexMap, IndexSet};

/// Per package: version → envs requiring it, plus the `workspaceSingleton` and `override` flags.
#[derive(Debug, Default)]
struct PeerVersions {
    versions: IndexMap<String, IndexSet<String>>,
    singleton: bool,
    r#override: bool,
}

/// The merge result.
#[derive(Debug, Default)]
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

fn collect(input: &ManifestInput<'_>) -> IndexMap<String, PeerVersions> {
    let mut peers: IndexMap<String, PeerVersions> = IndexMap::new();
    for component in super::load_order::load_order(input.components) {
        let Some(policy) = input.policies.envs.get(&component.env_id) else {
            continue;
        };
        let env = without_version(&component.env_id).to_string();
        for entry in &policy.self_policy {
            if input.components
                .iter()
                .any(|local| local.package_name == entry.name)
            {
                continue;
            }
            let peer = peers.entry(entry.name.clone()).or_default();
            peer.versions
                .entry(entry.version.clone())
                .or_default()
                .insert(env.clone());
            peer.singleton |= entry.workspace_singleton;
            peer.r#override |= entry.r#override;
        }
    }
    peers
}

/// Envs whose required `version` the candidate satisfies.
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
                    .cloned()
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
    let candidates: Vec<&String> = versions
        .keys()
        .filter(|version| {
            !bit_object_import::plus_version::is_plus(version) && coerce(version).is_some()
        })
        .collect();
    let Some(first) = candidates.first() else {
        return versions
            .keys()
            .next()
            .cloned()
            .unwrap_or_default();
    };
    let (mut best, mut best_count) = ((*first).clone(), 0);
    for candidate in candidates {
        let Some(coerced) = coerce(candidate) else { continue };
        let count = satisfied_envs(candidate, &coerced, versions);
        let higher = coerce(&best).is_some_and(|best| gt(&coerced, &best).unwrap_or(false));
        if count > best_count || (count == best_count && higher) {
            (best, best_count) = (candidate.clone(), count);
        }
    }
    warnings.extend(conflict_warning(name, &best, versions));
    best
}

fn hint(package: &str) -> String {
    format!(
        "\n💡 To resolve workspace peer version conflicts, pin a version in workspace.jsonc under \"teambit.dependencies/dependency-resolver\" > \"overrides\", e.g. \"overrides\": {{ \"{package}\": \"<version>\" }}\n",
    )
}

impl EnvRoot {
    fn add_root(&mut self, name: &str, version: &str, overrides: bool) {
        if name.trim().is_empty() || version.trim().is_empty() {
            return;
        }
        self.peers.insert(name.to_string(), version.to_string());
        if overrides && !bit_object_import::plus_version::is_plus(version) {
            self.overrides.insert(name.to_string(), version.to_string());
        }
    }

    fn per_component(&mut self, name: &str, versions: &IndexMap<String, IndexSet<String>>) {
        for (version, envs) in versions
            .iter()
            .filter(|(version, _)| !bit_object_import::plus_version::is_plus(version))
        {
            for env in envs {
                self.component_peers
                    .entry(env.clone())
                    .or_default()
                    .insert(name.to_string(), version.clone());
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
