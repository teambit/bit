//! Workspace-root tracking preserves ownership, empty-env policy, and native VCS consumers ([`callbacks`], [`policy`], [`root`], [`inspection`]).
//!
//! Organizes callback, inspection, policy, and root-tracking suites for Harmony `bit add`.

mod callbacks;
mod policy;
mod root;

mod inspection;
