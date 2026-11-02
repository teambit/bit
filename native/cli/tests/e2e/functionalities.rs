//! End-to-end core functionality suites (`e2e/functionalities/`: [`auto_tagging`], [`binary_files`], [`components_index`], [`dev_dependencies`], [`dynamic_namespaces`], [`env_peer_deps_install`], [`merge`], [`peer_dependencies`], [`peer_dependency_component`], [`repository_hooks_aspects`], [`workspace_config`]).
//!
//! Groups auto-tagging, binary files, component index, dependency resolution, merge, and `workspace.jsonc` policy tests.

mod auto_tagging;
mod binary_files;
mod components_index;
mod dev_dependencies;
mod dynamic_namespaces;
mod env_peer_deps_install;
mod merge;
mod peer_dependencies;
mod peer_dependency_component;
mod repository_hooks_aspects;
mod workspace_config;
