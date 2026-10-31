use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    pub(super) root: PathBuf,
    pub(super) home: PathBuf,
    pub(super) global_remotes_file: PathBuf,
    pub(super) operation: Operation,
    #[serde(default)]
    pub(super) internal_snapshot_preview: bool,
    pub(super) options: Options,
    #[serde(default)]
    pub(super) dependency_grammar: serde_json::Value,
    #[serde(default)]
    pub(super) defer_checkout_pattern: bool,
}
#[derive(Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Operation {
    Checkout,
    Merge,
    Switch,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Options {
    pub(super) to: Option<String>,
    pub(super) pattern: Option<String>,
    pub(super) strategy: Option<String>,
    pub(super) message: Option<String>,
    pub(super) lane: Option<LaneOptions>,
    #[serde(flatten)]
    pub(super) scope: ScopeOptions,
    pub(super) stash: Option<StashOptions>,
    #[serde(flatten)]
    flags: Flags,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ScopeOptions {
    #[serde(default)]
    pub(super) include_new_from_scope: bool,
    #[serde(default)]
    pub(super) scope_candidates: Vec<String>,
    pub(super) lane_history: Option<super::lane_history::Options>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StashOptions {
    #[serde(default)]
    pub(super) versions: Vec<StashVersion>,
    #[serde(default)]
    pub(super) bitmap_entries: Vec<serde_json::Value>,
    pub(super) reset_ids: Option<Vec<String>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StashVersion {
    pub(super) identity: String,
    pub(super) version: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LaneOptions {
    pub(super) name: String,
    pub(super) alias: Option<String>,
    pub(super) pattern: Option<String>,
    #[serde(flatten)]
    pub(super) flags: LaneFlags,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LaneFlags {
    pub(super) resolve_unrelated: Option<String>,
    #[serde(default)]
    pub(super) no_auto_snap: bool,
    #[serde(default)]
    pub(super) no_squash: bool,
    #[serde(default)]
    pub(super) squash: bool,
    #[serde(default)]
    pub(super) skip_fetch: bool,
    #[serde(default)]
    pub(super) include_deps: bool,
    #[serde(default)]
    pub(super) workspace_only: bool,
    #[serde(default)]
    pub(super) exclude_non_lane_comps: bool,
}
impl std::ops::Deref for LaneOptions {
    type Target = LaneFlags;
    fn deref(&self) -> &Self::Target {
        &self.flags
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Flags {
    #[serde(default)]
    pub(super) all: bool,
    #[serde(default)]
    pub(super) force_ours: bool,
    #[serde(default)]
    pub(super) force_theirs: bool,
    #[serde(default)]
    pub(super) no_snap: bool,
    #[serde(default)]
    pub(super) revert: bool,
    #[serde(default)]
    pub(super) workspace_only: bool,
    #[serde(default, rename = "verbose")]
    _verbose: bool,
    #[serde(default)]
    pub(super) skip_dependency_installation: bool,
}
impl std::ops::Deref for Options {
    type Target = Flags;
    fn deref(&self) -> &Flags {
        &self.flags
    }
}
