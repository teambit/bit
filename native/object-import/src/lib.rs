//! Native repository object import, checkout, merge, history, and workspace command engine ([`lane_create`], [`lane_manage`], [`reset_lane`], [`render_workspace_bitmap`]).

#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]

pub mod component_delete;
pub mod component_deprecation;
pub mod component_fork;
pub mod component_move;
pub mod component_recover;
pub mod component_remove;
pub mod component_rename;
pub mod component_scope_rename;
pub mod component_tracking;
pub mod export_actions;
pub mod export_progress;
pub mod lane_create;
pub mod lane_history;
pub mod lane_manage;
pub mod lane_remove;
pub mod plus_range_versions;
pub mod plus_version;
pub mod remote_delete;
pub mod reset_lane;
pub mod reset_main;
pub mod reset_never_exported;
pub mod reset_soft;
pub mod stash_store;

pub use bit_workspace_config::jsonc;
/// Bit's JSONC reader (comments and trailing commas), used for `.bitmap` and `workspace.jsonc`.
pub use bit_workspace_config::parse_jsonc;
/// Resolves local or remote lane identity from `.bitmap` and `index.json` without a `Node.js` round trip.
pub use command_import::lane::resolve_lane_identity;
/// Serializes JSON via [`json_stringify::stringify_json`] with `JavaScript` property ordering and `binary64` number formatting.
pub use json_stringify::stringify_json;
/// Native import merge decisions (`kind: component | version | versionHistory | ...`).
pub use operation::plan as plan_import_operation;
/// Reads and decodes scope objects directly from the local `objects` directory without `Node.js` adapters.
pub use repository::{read_object_directory, read_raw_scope_object, read_scope_object};
pub use scope::path as scope_path;
pub use session::WorkspaceSession;
pub use snapshot_transaction::next_published_version;
pub use workspace::engine::{
    effective_workspace_configuration,
    read_dependency_cache::{
        cache_stale as dependency_cache_stale, read_cache as read_dependency_cache,
    },
    recovery_remote_connection,
};

mod checkout;
mod checkout_transition;
mod command_import;
mod config_merge;
mod history_query;
mod history_reset;
mod inspection;
mod js_json;
mod json_stringify;
mod merge_history;
mod merge_state;
mod merge_transaction;
mod metadata;
mod mutable_store;
mod operation;
mod protocol;
mod read_budget;
mod read_version;
mod recovery;
mod repository;
mod reset_config;
mod scope;
mod session;
mod snapshot;
mod snapshot_projection;
mod snapshot_transaction;
mod store;
mod tag_index;
mod transfer;
mod validate;
mod workspace;

/// Returns `true` when `ver` is not a non-blank JSON string.
#[inline]
fn blank_string(ver: &serde_json::Value) -> bool {
    ver.as_str()
        .is_none_or(|text| text.trim().is_empty())
}

/// Serialize workspace component rows with the published bitmap header and property order via [`inspection::render_workspace_bitmap`].
pub fn render_workspace_bitmap(value: &serde_json::Value) -> std::io::Result<Vec<u8>> {
    if value
        .as_object()
        .is_none_or(|rows| {
            rows.len() > 65_536
                || rows.get("$schema-version").is_some_and(blank_string)
                || rows
                    .get("version")
                    .is_some_and(|ver| !ver.is_null() && blank_string(ver))
                || rows
                    .get("_bit_lane")
                    .is_some_and(|lane| !lane.is_null() && !lane.is_object())
        })
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "workspace bitmap must be a JSON object",
        ));
    }
    inspection::render_workspace_bitmap(value)
}
