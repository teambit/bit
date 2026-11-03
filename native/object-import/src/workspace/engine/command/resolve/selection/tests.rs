//! Unit tests for pending vs. explicit workspace component [`select`] order.
//!
//! Confirms that implicit pending selection via [`select`] follows pending order ([`pending_order_and_explicit_workspace_order_are_distinct`]) whereas explicit subsets preserve target order ([`explicit_subset_preserves_target_order_and_rejects_unlisted_pending_rows`]).

use super::select;
use serde_json::json;

/// Verifies that [`select`] distinguishes implicit pending insertion order from explicit workspace target order.
#[test]
fn pending_order_and_explicit_workspace_order_are_distinct() {
    let targets = vec![json!({"identity":"s/a"}), json!({"identity":"s/b"})];
    let pending =
        vec![json!({"id":{"scope":"s","name":"b"}}), json!({"id":{"scope":"s","name":"a"}})];
    assert_eq!(select(&targets, &pending, None).unwrap(), ["s/b", "s/a"]);
    assert_eq!(
        select(&targets, &pending, Some(&["s/a".into(), "s/b".into()])).unwrap(),
        ["s/a", "s/b"],
    );
}

/// Verifies that [`select`] declines duplicate pending entries, unknown explicit IDs, and empty pending selections.
#[test]
fn missing_and_duplicate_pending_selections_decline() {
    let targets = vec![json!({"identity":"s/a"})];
    let row = json!({"id":{"scope":"s","name":"a"}});
    assert!(select(&targets, &[row.clone(), row.clone()], None).is_err());
    assert!(select(&targets, &[row], Some(&["s/b".into()])).is_err());
    assert!(select(&targets, &[], None).is_err());
}

/// Verifies that [`select`] preserves workspace target order for explicit subsets and rejects unlisted pending rows ([`json`], [`missing_and_duplicate_pending_selections_decline`]).
#[test]
fn explicit_subset_preserves_target_order_and_rejects_unlisted_pending_rows() {
    let targets = vec![json!({"identity":"s/a"}), json!({"identity":"s/b"})];
    let pending = vec![json!({"id":{"scope":"s","name":"a"}})];
    assert_eq!(select(&targets, &pending, Some(&["s/a".into()])).unwrap(), ["s/a"]);
    assert!(select(&targets, &pending, Some(&["s/a".into(), "s/b".into()])).is_err());
}
