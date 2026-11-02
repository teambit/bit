//! Native `bit install` implementation. See `docs/rust/native-install.md`.
//!
//! Integrates workspace config loading, dependency detection, manifest generation, and the pnpm engine via [`run`] and [`run_with_options`].
#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]

pub mod command;
pub mod config;
pub mod dependencies;
pub mod engine;
pub mod host;
pub mod import;
pub mod links;
pub mod manifests;
pub mod model;
pub mod options;
pub mod output;
pub mod policy;
pub mod workspace;

/// Re-exported comment-preserving `JSONC` parser and editor from `bit_object_import`.
pub use bit_object_import::jsonc;
/// Re-exported top-level `bit install` entry points, outcomes, and stored-graph helpers.
pub use command::{InstallSummary, Outcome, run, run_with_options, stored_graphs};
/// Re-exported `JavaScript` host trait and process metadata types.
pub use host::{AfterInstall, AfterInstallResult, DetectRequest, Host, HostInfo};
/// Re-exported `bit install` CLI option flags ([`InstallOptions`]) and existing-entry policies ([`ExistingEntries`]).
pub use options::{ExistingEntries, InstallOptions};
