use super::{Material, Participation, allocations};
use serde_json::json;

#[test]
fn distinct_components_cannot_share_a_snapshot_hash() {
    let material = |identity: &str| Material {
        identity: identity.into(),
        model: json!({}),
        version: json!({}),
        files: Vec::new(),
        current_head: String::new(),
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
