//! Remote fetch request options ([`FetchOptions`]), [`Traversal`] flags, and [`Selection`] descriptors.

use crate::GlobalConfig;
use serde::Serialize;
use serde_json::Value;

/// Current remote fetch wire schema version (`CURRENT_FETCH_SCHEMA`) used by [`FetchOptions`].
const FETCH_SCHEMA: &str = "0.0.3";

/// `FETCH_OPTIONS` as sent to a remote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchOptions {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub fetch_schema: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane_id: Option<String>,
    #[serde(flatten)]
    pub traversal: Traversal,
    #[serde(flatten)]
    pub selection: Selection,
}

/// What to collect around each requested version.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Traversal {
    /// Backward compatibility with remotes older than 0.0.900.
    pub without_dependencies: bool,
    pub include_dependencies: bool,
    pub prefer_dependency_graph: bool,
    pub only_if_built: bool,
    pub include_version_history: bool,
    pub collect_parents: bool,
}

/// Which components a remote returns.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub include_artifacts: bool,
    pub allow_external: bool,
    pub ignore_missing_head: bool,
    pub return_nothing_if_given_version_exists: bool,
    pub include_lane_history: bool,
}

impl FetchOptions {
    /// Trim `lane_id` and return `None` when empty or whitespace-only for [`FetchOptions`].
    #[inline]
    fn normalize_lane_id(lane_id: Option<String>) -> Option<String> {
        let id = lane_id?;
        let trimmed = id.trim();
        if trimmed.is_empty() {
            None
        } else if trimmed.len() == id.len() {
            Some(id)
        } else {
            Some(trimmed.to_owned())
        }
    }

    /// `importWithoutDeps` with `fetchHeadIfLocalIsBehind` (`getExternalManyWithoutDeps`) on [`FetchOptions`].
    #[inline]
    #[must_use]
    pub fn latest(lane_id: Option<String>, delta: bool) -> Self {
        let lane_id = Self::normalize_lane_id(lane_id);
        Self {
            kind: "component",
            fetch_schema: FETCH_SCHEMA,
            traversal: Traversal {
                without_dependencies: true,
                include_version_history: true,
                ..Traversal::default()
            },
            selection: Selection {
                allow_external: lane_id.is_some(),
                ignore_missing_head: true,
                return_nothing_if_given_version_exists: delta,
                ..Selection::default()
            },
            lane_id,
        }
    }

    /// `importWithoutDeps` with default selection options: fetches the given versions only.
    #[inline]
    #[must_use]
    pub fn without_dependencies(lane_id: Option<String>) -> Self {
        let lane_id = Self::normalize_lane_id(lane_id);
        Self {
            kind: "component",
            fetch_schema: FETCH_SCHEMA,
            traversal: Traversal { without_dependencies: true, ..Traversal::default() },
            selection: Selection { allow_external: lane_id.is_some(), ..Selection::default() },
            lane_id,
        }
    }

    /// `getExternalMany`: versions with their dependencies.
    #[inline]
    #[must_use]
    pub fn with_dependencies(lane_id: Option<String>, only_if_built: bool) -> Self {
        let lane_id = Self::normalize_lane_id(lane_id);
        Self {
            kind: "component",
            fetch_schema: FETCH_SCHEMA,
            traversal: Traversal {
                include_dependencies: true,
                prefer_dependency_graph: true,
                only_if_built,
                include_version_history: true,
                ..Traversal::default()
            },
            selection: Selection { allow_external: lane_id.is_some(), ..Selection::default() },
            lane_id,
        }
    }

    /// `importLanes`: lane objects. `bit install` reaches it through
    /// `workspace.getCurrentRemoteLane()`, which keeps the default
    /// `includeLaneHistory = false`, so no `LaneHistory` is fetched.
    #[inline]
    #[must_use]
    pub fn lanes() -> Self {
        Self {
            kind: "lane",
            fetch_schema: FETCH_SCHEMA,
            lane_id: None,
            traversal: Traversal { without_dependencies: true, ..Traversal::default() },
            selection: Selection::default(),
        }
    }
}

/// Default concurrent remote fetch limit (`CONCURRENT_FETCH_LIMIT`).
const DEFAULT_CONCURRENCY: usize = 15;

/// `concurrentFetchLimit()`: `concurrency.fetch` from the bit config, else 15.
#[inline]
#[must_use]
pub fn concurrency(global: &GlobalConfig) -> usize {
    ["concurrency.fetch", "concurrency_fetch", "network.concurrency", "network_concurrency"]
        .into_iter()
        .find_map(|key| {
            let value = global.get(key)?;
            let parsed = match value {
                Value::Number(number) => number.as_u64()?,
                Value::String(text) => text.trim().parse().ok()?,
                _ => return None,
            };
            usize::try_from(parsed)
                .ok()
                .filter(|limit| *limit > 0)
                .map(|limit| limit.min(256))
        })
        .unwrap_or(DEFAULT_CONCURRENCY)
}
