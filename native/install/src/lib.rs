#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]
//! Native `bit install`. See `docs/rust/native-install.md`.

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

pub use bit_object_import::jsonc;
pub use command::{InstallSummary, Outcome, run, run_with_options, stored_graphs};
pub use host::{AfterInstall, AfterInstallResult, DetectRequest, Host, HostInfo};
pub use options::{ExistingEntries, InstallOptions};
