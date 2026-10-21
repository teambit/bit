//! `e2e/harmony/`.
mod add;
mod bit_ignore;
mod delete;
mod deprecation;
mod fork;
mod install_compat;
mod lane_adoption;
mod lane_graph_reset;
mod lane_import_callbacks;
mod lane_restoration;
mod lanes;
mod merge_callbacks;
mod merge_history;
mod merge_lifecycle;
mod merge_policy;
mod merge_recovery;
mod refactor;
mod rename;
mod scope_fork;
mod scope_rename;
mod workspace_config;

mod bitmap_states;
mod checkout_callbacks;
mod checkout_local;
mod checkout_platform;
mod checkout_policy;
mod checkout_scope;
mod checkout_selection;
mod config;
mod doctor;
mod doctor_remote;
mod log;
mod no_fs_cache;
mod reset_selection;
mod revert;
mod status_component_policy;
mod status_component_selectors;
mod status_harmony;
mod status_lanes;

mod status_environments;

mod status_completion;

mod status_relative;

mod status_graph_remote;

mod status_autosync;

mod snapshot_environments;

mod export_completion;

mod export_hub;

mod export_callbacks;

mod file_history;

mod stash;

mod untag;

mod uninstall_cmd;

mod use_cmd;

mod export_harmony;
mod import_non_main_files;
mod init_harmony;
mod recover;
mod set_default_owner_and_scope;

mod aspect;
mod ci_bitmap_auto_sync;
mod ci_sync;
mod component_config;
mod dependencies_cmd;
mod env;
mod extensions_config;
mod extensions_config_diff;
mod git_worktree;
mod local_head_not_found;
mod merge_config;
mod new_component_id_exists_on_remote;
mod no_files;
mod out_of_sync_components_harmony;
mod scope_trust;
mod track_directories_harmony;
mod updates_from_main_and_lane;
mod workspace_misc;
