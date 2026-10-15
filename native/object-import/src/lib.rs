#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]

pub mod reset_main;

/// Native import merge decisions (`kind: component | version | versionHistory | ...`).
pub use operation::plan as plan_import_operation;
/// Bit's JSONC reader (comments and trailing commas), used for `.bitmap`.
pub use recovery::jsonc::parse as parse_jsonc;
pub use session::WorkspaceSession;
pub use workspace::engine::read_dependency_cache::{
    cache_stale as dependency_cache_stale, read_cache as read_dependency_cache,
};

mod checkout;
mod checkout_transition;
mod command_import;
mod config_merge;
mod history_query;
mod history_reset;
mod inspection;
mod js_json;
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
mod session;
mod snapshot;
mod snapshot_projection;
mod snapshot_transaction;
mod store;
mod transfer;
mod validate;
mod workspace;
