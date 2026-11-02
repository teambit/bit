//! Graph reset changes history and heads while preserving the merged working tree ([`boundaries`], [`divergence`], [`fixture`], [`hidden`], [`merged`], [`selected`], [`selected_discovery`]).
//!
//! Groups lane boundary, divergence, hidden-member, merge, and selection `bit reset` suites.

mod boundaries;
mod divergence;
mod fixture;
mod hidden;
mod merged;
mod selected;
mod selected_discovery;
