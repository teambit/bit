//! End-to-end cases from `e2e/harmony/ci-sync-*.e2e.ts` ([`branch_ownership`], [`convergence`], [`lane_cycle`], [`main_scope`], [`onboarding`], [`scopes`], [`state`], [`support`]):
//! - `e2e/harmony/ci-sync-lane-cycle.e2e.ts`
//! - `e2e/harmony/ci-sync-scopes.e2e.ts`
//! - `e2e/harmony/ci-sync-branch-ownership.e2e.ts`
//! - `e2e/harmony/ci-sync-convergence.e2e.ts`
//! - `e2e/harmony/ci-sync-state.e2e.ts`
//! - `e2e/harmony/ci-sync-main.e2e.ts`
//!
//! Groups lane and branch reconciliation, ownership, convergence, main-scope sync, and onboarding test suites.

/// End-to-end `bit ci sync` branch ownership and first-contact adoption tests.
mod branch_ownership;
/// End-to-end `bit ci sync` convergence, push-race, and conflict-policy tests.
mod convergence;
/// End-to-end `bit ci sync` lane/branch reconciliation cycle tests.
mod lane_cycle;
/// End-to-end `bit ci sync --main` and `--dry-run` default-branch reconciliation tests.
mod main_scope;
mod onboarding;
mod scopes;
mod state;
mod support;
