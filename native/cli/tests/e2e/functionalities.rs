//! End-to-end core functionality suites (`e2e/functionalities/`: [`auto_tagging`], [`binary_files`], [`components_index`], [`dev_dependencies`], [`dynamic_namespaces`], [`env_peer_deps_install`], [`merge`], [`peer_dependencies`], [`peer_dependency_component`], [`repository_hooks_aspects`], [`workspace_config`]).
//!
//! Groups auto-tagging, binary asset tracking, component index, dependency resolution, merge, and `workspace.jsonc` policy tests.

/// End-to-end dependent auto-tagging tests across transitive, cyclic, and diamond graphs.
mod auto_tagging;
/// End-to-end binary file tracking and export tests.
mod binary_files;
/// End-to-end `.bit/index.json` maintenance and recovery tests.
mod components_index;
/// End-to-end dev-dependency resolution, deduplication, and tagging tests.
mod dev_dependencies;
/// End-to-end multi-level dynamic namespace component ID tests.
mod dynamic_namespaces;
/// End-to-end environment peer dependency installation and typechecking tests.
mod env_peer_deps_install;
mod merge;
mod peer_dependencies;
mod peer_dependency_component;
mod repository_hooks_aspects;
mod workspace_config;
