//! `parse` of `@pnpm/deps.path`.

use pnpm_deps_path::{DepPathSuffixIndex, index_of_dep_path_suffix};

/// A parsed dependency path: `name@version(patch_hash=…)(peers)`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct DependencyPath {
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
    pub(super) fn to_ref(&self) -> String {
        let base_version = self.version
            .as_deref()
            .or(self.non_semver_version.as_deref())
            .unwrap_or_default();
        format!(
            "{base_version}{}{}",
            self.patch_hash.as_deref().unwrap_or_default(),
            self.peer_dep_graph_hash.as_deref().unwrap_or_default(),
        )
    }
}

pub(super) fn parse(dep_path: &str) -> DependencyPath {
    let dep_path = dep_path.trim();
    let Some(separator) = dep_path
        .get(1..)
        .and_then(|rest| rest.find('@'))
        .map(|index| index + 1)
    else {
        return DependencyPath::default();
    };
    let mut parsed = DependencyPath {
        name: Some(dep_path[..separator].trim().to_string()),
        ..DependencyPath::default()
    };
    let mut version = dep_path[separator + 1..].trim();
    let DepPathSuffixIndex { peers_index, patch_hash_index } = index_of_dep_path_suffix(version);
    match (patch_hash_index, peers_index) {
        (Some(patch), Some(peers)) => {
            parsed.patch_hash = Some(version[patch..peers].to_string());
            parsed.peer_dep_graph_hash = Some(version[peers..].to_string());
            version = &version[..patch];
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

/// Strip the peer and patch suffix (`removeSuffix`).
pub(super) fn remove_suffix(dep_path: &str) -> &str {
    pnpm_deps_path::remove_suffix(dep_path.trim())
}
