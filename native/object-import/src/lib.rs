#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]

pub mod component_delete;
pub mod component_recover;
pub mod component_remove;
pub mod lane_create;
pub mod lane_history;
pub mod lane_manage;
pub mod lane_remove;
pub mod reset_lane;
pub mod reset_main;
pub mod reset_never_exported;
pub mod reset_soft;

pub use json_stringify::stringify_json;
/// Native import merge decisions (`kind: component | version | versionHistory | ...`).
pub use operation::plan as plan_import_operation;
/// Bit's JSONC reader (comments and trailing commas), used for `.bitmap`.
pub use recovery::jsonc::parse as parse_jsonc;
pub use scope::path as scope_path;
pub use session::WorkspaceSession;
pub use snapshot_transaction::next_published_version;
pub use workspace::engine::{
    effective_workspace_configuration,
    read_dependency_cache::{
        cache_stale as dependency_cache_stale, read_cache as read_dependency_cache,
    },
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
mod reset_config;
mod scope;
mod session;
mod snapshot;
mod snapshot_projection;
mod snapshot_transaction;
mod store;
mod transfer;
mod validate;
mod workspace;
