//! End-to-end multi-command workflow suites (`e2e/flows/`: [`big_file`], [`bitmap_deleted`], [`cyclic_dependencies`], [`delete_files`], [`id_with_wildcard`], [`import_package_json`], [`out_of_sync_components`], [`remote_commands_outside_workspace`], [`same_name_different_scopes`], [`sort_components_output`]) for native CLI parity.
//!
//! Groups cross-command flow integration tests ported from the upstream `e2e/flows/` suite.

/// End-to-end CRLF large-file tracking and tagging flow tests.
mod big_file;
/// End-to-end `bit init` and `bit init --force` tests when `.bitmap` is deleted.
mod bitmap_deleted;
/// End-to-end circular dependency analysis (`bit deps circular`, `bit insights circular`) and tagging tests.
mod cyclic_dependencies;
/// End-to-end deleted component file handling tests in `bit status` and `bit tag`.
mod delete_files;
mod id_with_wildcard;
mod import_package_json;
mod out_of_sync_components;
mod remote_commands_outside_workspace;
mod same_name_different_scopes;
mod sort_components_output;
