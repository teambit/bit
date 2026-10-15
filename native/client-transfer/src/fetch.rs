use crate::GlobalConfig;
use serde::Serialize;
use serde_json::Value;

/// `CURRENT_FETCH_SCHEMA`.
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
    /// `importWithoutDeps` with `fetchHeadIfLocalIsBehind` (`getExternalManyWithoutDeps`).
    #[must_use]
    pub fn latest(lane_id: Option<String>, delta: bool) -> Self {
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

    /// `importWithoutDeps` with the defaults: the given versions only.
    #[must_use]
    pub fn without_dependencies(lane_id: Option<String>) -> Self {
        Self {
            kind: "component",
            fetch_schema: FETCH_SCHEMA,
            traversal: Traversal { without_dependencies: true, ..Traversal::default() },
            selection: Selection { allow_external: lane_id.is_some(), ..Selection::default() },
            lane_id,
        }
    }

    /// `getExternalMany`: versions with their dependencies.
    #[must_use]
    pub fn with_dependencies(lane_id: Option<String>, only_if_built: bool) -> Self {
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

/// `CONCURRENT_FETCH_LIMIT`.
const DEFAULT_CONCURRENCY: usize = 15;

/// `concurrentFetchLimit()`: `concurrency.fetch` from the bit config, else 15.
#[must_use]
pub fn concurrency(global: &GlobalConfig) -> usize {
    global
        .get("concurrency.fetch")
        .and_then(|value| match value {
            Value::Number(number) => number.as_u64(),
            Value::String(text) => text.parse().ok(),
            _ => None,
        })
        .and_then(|limit| usize::try_from(limit).ok())
        .filter(|limit| *limit > 0)
        .unwrap_or(DEFAULT_CONCURRENCY)
}
