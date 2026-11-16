//! Unit tests for command [`Prepare`] setup inactive metadata, [`component_controls`], and addition destination [`proof`]s in `bit-object-import`.
//!
//! Confirms that inactive target control files in [`Directory`] workspaces via [`component_controls`] and [`lane_context`] addition [`proof`]s ([`inactive_metadata_and_new_directory_are_revalidated_before_publication`], [`empty_lane_context_produces_no_component_control_or_addition_proofs`]) are revalidated before commit using [`json`].

use super::{Prepare, component_controls, proof};
use crate::workspace::engine::command::{lane_context, scratch::Directory};
use serde_json::json;
use std::fs;
/// Verifies that [`component_controls`] and [`lane_context`] addition [`proof`]s detect concurrent filesystem changes before commit.
#[test]
fn inactive_metadata_and_new_directory_are_revalidated_before_publication() {
    let root = Directory::create().unwrap();
    fs::create_dir(root.0.join("inactive")).unwrap();
    let request: Prepare = serde_json::from_value(json!({"root":root.0,"home":root.0,"globalRemotesFile":root.0.join("remotes"),"operation":"merge","options":{"skipDependencyInstallation":true}})).unwrap();
    let context = json!({"targets":[],"lane":{"inactiveTargets":[{"directory":"inactive","config":null,"packageJson":null}],"addedTargets":[{"directory":"new","config":null,"packageJson":null}],"additions":[{"rootDir":"new"}]}});
    let mut controls = Vec::new();
    component_controls(&request, &context, &mut controls).unwrap();
    proof::verify(&controls).unwrap();
    fs::write(root.0.join("inactive/component.json"), b"{}").unwrap();
    assert!(proof::verify(&controls).is_err());
    let mut destinations = Vec::new();
    lane_context::validate_additions(&root.0, &context, &mut destinations).unwrap();
    fs::create_dir(root.0.join("new")).unwrap();
    assert!(proof::verify(&destinations).is_err());
    assert!(lane_context::validate_additions(&root.0, &context, &mut Vec::new()).is_err());
}

/// Verifies that [`component_controls`] and [`lane_context::validate_additions`] emit no [`proof`]s in [`Directory`] when the lane context is empty.
#[test]
fn empty_lane_context_produces_no_component_control_or_addition_proofs() {
    let root = Directory::create().unwrap();
    let request: Prepare = serde_json::from_value(json!({"root":root.0,"home":root.0,"globalRemotesFile":root.0.join("remotes"),"operation":"merge","options":{"skipDependencyInstallation":true}})).unwrap();
    let context = json!({"targets":[]});
    let mut controls = Vec::new();
    component_controls(&request, &context, &mut controls).unwrap();
    assert!(controls.is_empty());
    let mut destinations = Vec::new();
    lane_context::validate_additions(&root.0, &context, &mut destinations).unwrap();
    assert!(destinations.is_empty());
}
