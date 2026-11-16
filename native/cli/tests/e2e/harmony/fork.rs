//! Released `bit fork` contracts: strict command bytes and complete same-path state ([`installation`], [`callbacks`], [`corruption`], [`http`], [`options`], [`patterns`], [`remote`], [`support`]).
//!
//! Covers local and remote forking, `--no-link`, provenance tracking, and post-fork snapping.

/// Post-fork pnpm package installation and compilation output parity tests alongside [`support`].
pub(super) mod installation;

pub(super) use support::{assert_origins, delay_copies, exported, ids, remote_workspace};

/// Provider `onLoad` and `onAdd` callback ordering tests during `bit fork`.
mod callbacks;
/// Missing and corrupt remote `Source` object failure tests during `bit fork`.
mod corruption;
/// End-to-end HTTP scope `bit fork` private object capture tests.
mod http;
/// End-to-end `bit fork` CLI flag and refactoring option tests.
mod options;
mod patterns;
mod remote;
mod support;

use crate::commands::move_paths::support::{aspect, bitmap, json, setup, successful};
use serde_json::json;

/// Verifies that local `bit fork` creates a new component with sanitized `teambit.component/forking` provenance.
#[test]
fn local_fork_creates_a_new_component_with_sanitized_original_provenance() {
    let helper = support::exported(1);
    let before = bitmap(&helper)["comp1"].clone();
    successful(&helper, "fork comp1 comp2");
    assert_eq!(
        json(&helper, "status --json")["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let origin = aspect(&helper, "comp2", support::FORK).unwrap();
    assert_eq!(origin["forkedFrom"]["name"], "comp1");
    assert_eq!(origin["forkedFrom"]["scope"], helper.scopes.remote);
    assert!(bitmap(&helper)["comp2"]["config"][support::FORK].get("__specific").is_none());
    assert_eq!(bitmap(&helper)["comp1"], before);
}

/// Verifies `bit fork --no-link` omits `forkedFrom` provenance while creating the target package link ([`successful`], [`aspect`], [`json`]).
#[test]
fn no_link_omits_only_original_provenance_not_the_new_package_link() {
    let helper = support::exported(1);
    successful(&helper, "fork comp1 comp-no-link --no-link");
    assert!(aspect(&helper, "comp-no-link", support::FORK).is_none());
    assert_eq!(
        json(&helper, "status --json")["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert!(
        helper.scopes.local_path
            .join(format!("node_modules/@{}/comp-no-link", helper.scopes.remote))
            .is_dir(),
    );
}

#[test]
fn forked_component_can_be_snapped_and_exported_without_rewriting_the_original() {
    let helper = support::exported(1);
    let original = bitmap(&helper)["comp1"].clone();
    successful(&helper, "fork comp1 comp2");
    setup(&helper, "snap comp2 --ignore-issues * --message forked");
    crate::helper::remote::publish(&helper);
    assert_eq!(bitmap(&helper)["comp1"], original);
    assert_eq!(
        aspect(&helper, "comp2", support::FORK).unwrap()["forkedFrom"]["name"],
        json!("comp1"),
    );
}
