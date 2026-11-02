//! Unit tests for snapshot hash [`allocations`] uniqueness across [`Material`] components.
//!
//! Ensures distinct components with [`Participation`] and [`VersionState`] never share a snapshot hash and map cleanly by identity.

use super::{Material, Participation, VersionState, allocations};
use serde_json::json;

/// Verifies that [`allocations`] rejects receipts where two distinct [`Material`] components share the same snapshot hash.
#[test]
fn distinct_components_cannot_share_a_snapshot_hash() {
    let material = |identity: &str| Material {
        identity: identity.into(),
        model: json!({}),
        version: json!({}),
        files: Vec::new(),
        version_state: VersionState { current_head: String::new(), tagged_version: None },
        pending: None,
        hidden: false,
        participation: Participation { selected: true, automatic: false },
    };
    let materials = [material("scope/one"), material("scope/two")];
    let receipt = json!({"batchId":"batch","bitVersion":"2.2.93","log":{"date":"1"},
        "versions":[{"identity":"scope/one","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
                    {"identity":"scope/two","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]});
    assert!(allocations(&materials, &receipt).is_err());
}

/// Verifies that [`allocations`] maps distinct snapshot hashes to their corresponding [`Material`] component identities.
#[test]
fn distinct_hashes_map_cleanly_to_each_component_identity() {
    let material = |identity: &str| Material {
        identity: identity.into(),
        model: json!({}),
        version: json!({}),
        files: Vec::new(),
        version_state: VersionState { current_head: String::new(), tagged_version: None },
        pending: None,
        hidden: false,
        participation: Participation { selected: true, automatic: false },
    };
    let materials = [material("scope/one"), material("scope/two")];
    let receipt = json!({"batchId":"batch","bitVersion":"2.2.93","log":{"date":"1"},
        "versions":[{"identity":"scope/one","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
                    {"identity":"scope/two","hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]});
    let allocated = allocations(&materials, &receipt).unwrap();
    assert_eq!(allocated["scope/one"], "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert_eq!(allocated["scope/two"], "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
}
