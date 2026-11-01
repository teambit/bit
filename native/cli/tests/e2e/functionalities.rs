//! End-to-end core functionality suites (`e2e/functionalities/`).
//!
//! Groups auto-tagging, binary files, component index, dependency resolution, merge, and workspace config tests.

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
