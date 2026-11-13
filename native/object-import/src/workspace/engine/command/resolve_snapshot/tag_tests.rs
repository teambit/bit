//! Unit tests for local model [`object`] tag version and orphaned [`VersionState`] updates in `bit-object-import`.
//!
//! Verifies that newly tagged [`Material`], [`Participation`], and [`VersionState`] versions clear matching `orphanedVersions` entries and update `head` via [`object`] ([`tag_model_keeps_object_identity_distinct_from_semantic_identity`], [`snap_model_updates_head_without_mutating_existing_tag_versions`]) using [`json`].

use super::{Material, Participation, VersionState, object};
use serde_json::json;

/// Verifies that [`object`] local model updates record new tag versions, clear matching `orphanedVersions`, and mark local state.
#[test]
fn tag_model_keeps_object_identity_distinct_from_semantic_identity() {
    let old = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let new = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let material = Material {
        identity: "scope/component".into(),
        model: json!({"scope":"scope","name":"component","versions":{"1.0.0":old},
            "orphanedVersions":{"1.1.0":old,"9.0.0":old},"head":old,"state":{"versions":{"1.0.0":{"local":true}}}}),
        version: json!({}),
        files: Vec::new(),
        version_state: VersionState {
            current_head: old.into(),
            tagged_version: Some("1.1.0".into()),
        },
        pending: None,
        hidden: false,
        participation: Participation { selected: true, automatic: false },
    };
    let model = object::local_model(&material, new).unwrap();
    assert_eq!(model["head"], new);
    assert_eq!(model["versions"]["1.0.0"], old);
    assert_eq!(model["versions"]["1.1.0"], new);
    assert!(model["orphanedVersions"].get("1.1.0").is_none());
    assert_eq!(model["orphanedVersions"]["9.0.0"], old);
    assert_eq!(material.model["orphanedVersions"]["1.1.0"], old);
    assert_eq!(model["state"]["versions"]["1.1.0"]["local"], true);
    assert!(model["state"]["versions"].get(new).is_none());
    let duplicate = Material { model, ..material };
    assert!(object::local_model(&duplicate, new).is_err());
}

/// Verifies that [`object::local_model`] updates `head` on a snap [`Material`] ([`VersionState`], [`Participation`]) without mutating existing tag entries in `versions`.
#[test]
fn snap_model_updates_head_without_mutating_existing_tag_versions() {
    let old = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let new = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let material = Material {
        identity: "scope/component".into(),
        model: json!({"scope":"scope","name":"component","versions":{"1.0.0":old},"head":old}),
        version: json!({}),
        files: Vec::new(),
        version_state: VersionState { current_head: old.into(), tagged_version: None },
        pending: None,
        hidden: false,
        participation: Participation { selected: true, automatic: false },
    };
    let model = object::local_model(&material, new).unwrap();
    assert_eq!(model["head"], new);
    assert_eq!(model["versions"]["1.0.0"], old);
}
