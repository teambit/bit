//! `parse` and `removeSuffix` of `@pnpm/deps.path` for lockfile snapshot keys.
//!
//! Splits lockfile dependency paths into package name, version, patch hash, and peer suffix components in [`DependencyPath`].

use pnpm_deps_path::{DepPathSuffixIndex, index_of_dep_path_suffix};

/// Parsed lockfile dependency path (`name@version(patch_hash=…)(peers)`).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct DependencyPath {
    /// Package name extracted from the dependency path.
    pub name: Option<String>,
    /// A valid semver version.
    pub version: Option<String>,
    /// Any other version (`file:…`, a URL, ...).
    pub non_semver_version: Option<String>,
    pub patch_hash: Option<String>,
    pub peer_dep_graph_hash: Option<String>,
}

impl DependencyPath {
    /// `version` + patch hash + peers hash (`depPathToRef`).
    #[inline]
    pub(super) fn to_ref(&self) -> String {
        let base_version = self.version
            .as_deref()
            .or(self.non_semver_version.as_deref())
            .unwrap_or_default();
        if self.patch_hash.is_none() && self.peer_dep_graph_hash.is_none() {
            return base_version.to_owned();
        }
        format!(
            "{base_version}{}{}",
            self.patch_hash.as_deref().unwrap_or_default(),
            self.peer_dep_graph_hash.as_deref().unwrap_or_default(),
        )
    }
}

/// Parse a lockfile dependency path (`name@version(patch_hash=…)(peers)`) into a [`DependencyPath`].
pub(super) fn parse(dep_path: &str) -> DependencyPath {
    let dep_path = dep_path.trim();
    let Some((name, mut version)) = dep_path
        .get(1..)
        .and_then(|rest| rest.find('@'))
        .map(|at| (dep_path[..=at].trim(), dep_path[at + 2..].trim()))
        .filter(|(name, version)| !name.is_empty() && !version.is_empty())
    else {
        return DependencyPath::default();
    };
    let mut parsed = DependencyPath { name: Some(name.to_string()), ..DependencyPath::default() };
    let DepPathSuffixIndex { peers_index, patch_hash_index } = index_of_dep_path_suffix(version);
    match (patch_hash_index, peers_index) {
        (Some(patch), Some(peers)) if patch <= peers => {
            parsed.patch_hash = Some(version[patch..peers].to_string());
            parsed.peer_dep_graph_hash = Some(version[peers..].to_string());
            version = &version[..patch];
        }
        (Some(patch), Some(peers)) => {
            parsed.peer_dep_graph_hash = Some(version[peers..patch].to_string());
            parsed.patch_hash = Some(version[patch..].to_string());
            version = &version[..peers];
        }
        (Some(patch), None) => {
            parsed.patch_hash = Some(version[patch..].to_string());
            version = &version[..patch];
        }
        (None, Some(peers)) => {
            parsed.peer_dep_graph_hash = Some(version[peers..].to_string());
            version = &version[..peers];
        }
        (None, None) => {}
    }
    if version.parse::<node_semver::Version>().is_ok() {
        parsed.version = Some(version.to_string());
    } else {
        parsed.non_semver_version = Some(version.to_string());
    }
    parsed
}

/// Strip the peer and patch suffix from `dep_path` (`removeSuffix`).
#[inline]
pub(super) fn remove_suffix(dep_path: &str) -> &str {
    pnpm_deps_path::remove_suffix(dep_path.trim())
}
