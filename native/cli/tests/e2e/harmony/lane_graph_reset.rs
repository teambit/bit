//! Graph reset changes history and heads while preserving the merged working tree ([`boundaries`], [`divergence`], [`fixture`], [`hidden`], [`merged`], [`selected`], [`selected_discovery`]).
//!
//! Groups lane boundary, divergence, hidden-member, merge, and selection `bit reset` end-to-end suites.

/// Boundary and main-base preservation tests for `bit reset` on a lane.
mod boundaries;
/// Remote divergence and exported-head tests for `bit reset` on a lane.
mod divergence;
/// Shared workspace, snap, and scope object helpers for lane `bit reset` tests.
mod fixture;
mod hidden;
mod merged;
mod selected;
mod selected_discovery;
