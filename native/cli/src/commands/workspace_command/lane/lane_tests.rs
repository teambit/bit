//! Unit tests for lane merge pattern filtering ([`pattern_ids`]), squash validation ([`validate`]), and receipt inspection ([`squash_hashes`], [`other_lane`]) against [`HASH`].
//!
//! Verifies lane target glob matching and rejection of `--no-snap` when squashing is required.

use super::{other_lane, pattern_ids, squash_hashes, validate};
use serde_json::json;

/// Canonical 40-hex snap hash fixture used in [`squash_hashes`] tests.
const HASH: &str = "0123456789abcdef0123456789abcdef01234567";

/// Verifies that [`pattern_ids`] filters [`json`] lane targets by glob pattern and returns `None` outside lane merges.
#[test]
fn lane_patterns_match_the_lane_targets() {
    let context =
        json!({ "lane": { "targets": [{ "identity": "s/one" }, { "identity": "s/two" }] } });
    let options = json!({ "lane": {}, "pattern": "s/t*" });
    assert_eq!(pattern_ids(&options, &context).unwrap(), Some(vec!["s/two".to_string()]));
    assert_eq!(
        pattern_ids(&json!({ "pattern": "s/*" }), &context).unwrap(),
        None,
        "not a lane merge",
    );
    assert!(pattern_ids(&json!({ "lane": {}, "pattern": "x/*" }), &context).is_err());
}

/// Verifies that [`validate`] rejects `--no-snap` when `shouldSquash` is `true` unless squashing is already handled.
#[test]
fn squashing_without_snaps_is_left_to_node() {
    let squash = json!({ "lane": { "shouldSquash": true } });
    assert!(validate(&json!({ "lane": {}, "noSnap": true }), &squash, false).is_err());
    assert!(validate(&json!({ "lane": {}, "noSnap": true }), &squash, true).is_ok());
    assert!(validate(&json!({ "lane": {}, "noSnap": false }), &squash, false).is_ok());
    assert!(
        validate(
            &json!({ "lane": {}, "noSnap": true }),
            &json!({ "lane": { "shouldSquash": false } }),
            false,
        )
        .is_ok(),
    );
}

/// Verifies [`squash_hashes`] and [`other_lane`] extraction and validation on lane merge receipts.
///
/// Ensures duplicate or non-hex hashes and empty remote scope names return errors.
#[test]
fn receipt_parts() {
    assert_eq!(squash_hashes(&json!({ "squashMessageHashes": [HASH] })).unwrap(), [HASH]);
    assert_eq!(squash_hashes(&json!({ "squashMessageHashes": [] })).unwrap(), Vec::<String>::new());
    assert!(squash_hashes(&json!({ "squashMessageHashes": [HASH, HASH] })).is_err());
    assert!(squash_hashes(&json!({ "squashMessageHashes": ["nope"] })).is_err());
    assert_eq!(
        other_lane(&json!({ "lane": { "otherId": { "scope": "s", "name": "dev" } } })).unwrap(),
        "s/dev",
    );
    assert!(other_lane(&json!({ "lane": { "otherId": { "scope": "", "name": "dev" } } })).is_err());
}
