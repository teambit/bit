//! End-to-end cases from `e2e/harmony/ci-sync-*.e2e.ts` ([`branch_ownership`], [`convergence`], [`lane_cycle`], [`main_scope`], [`onboarding`], [`scopes`], [`state`], [`support`]):
//! - `e2e/harmony/ci-sync-lane-cycle.e2e.ts`
//! - `e2e/harmony/ci-sync-scopes.e2e.ts`
//! - `e2e/harmony/ci-sync-branch-ownership.e2e.ts`
//! - `e2e/harmony/ci-sync-convergence.e2e.ts`
//! - `e2e/harmony/ci-sync-state.e2e.ts`
//! - `e2e/harmony/ci-sync-main.e2e.ts`
//!
//! Groups lane and branch reconciliation, ownership, convergence, main-scope sync, and onboarding suites.

mod branch_ownership;
mod convergence;
mod lane_cycle;
mod main_scope;
mod onboarding;
mod scopes;
mod state;
mod support;
