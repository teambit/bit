//! Workspace-root tracking preserves ownership, empty-env policy, and native VCS consumers ([`callbacks`], [`inspection`], [`policy`], [`root`]).
//!
//! Organizes callback, inspection, policy, and root-tracking test suites for native Harmony `bit add`.

/// End-to-end `onLoad` and package extension callback tests during `bit add`.
mod callbacks;
/// Shared `bit show` and `bit status` inspection helpers for `bit add` tests.
mod inspection;
/// End-to-end environment and variant policy tests for `bit add --root`.
mod policy;
/// End-to-end workspace-root ownership and collision tests for `bit add --root`.
mod root;
