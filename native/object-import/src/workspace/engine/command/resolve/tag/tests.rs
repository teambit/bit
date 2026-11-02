//! Unit tests for tag [`pattern_order`] matching order and wildcard eligibility checks in `bit-object-import`.
//!
//! Verifies that overlapping patterns preserve outer pattern order and every wildcard matches an eligible component without duplicates.

use super::pattern_order;
use serde_json::json;

/// Verifies that [`pattern_order`] preserves candidate and outer pattern order across overlapping patterns without duplicates.
#[test]
fn patterns_preserve_candidate_and_outer_order_with_overlap() {
    let candidates = vec!["scope/new".into(), "scope/old".into()];
    let rows = vec![
        json!({"identity":"scope/old","patternIndex":0}),
        json!({"identity":"scope/new","patternIndex":0}),
    ];
    assert_eq!(pattern_order(&candidates, &["**".into()], &rows).unwrap().identities, candidates);
    let rows = vec![
        json!({"identity":"scope/old","patternIndex":0}),
        json!({"identity":"scope/old","patternIndex":1}),
        json!({"identity":"scope/new","patternIndex":1}),
    ];
    assert_eq!(
        pattern_order(&candidates, &["scope/old".into(), "**".into()], &rows).unwrap().identities,
        vec!["scope/old", "scope/new"],
    );
}

/// Verifies that [`pattern_order`] requires every wildcard pattern to match at least one eligible candidate component.
#[test]
fn each_wildcard_must_match_an_eligible_component() {
    let candidates = vec!["scope/changed".into()];
    let rows = vec![
        json!({"identity":"scope/changed","patternIndex":0}),
        json!({"identity":"scope/unchanged","patternIndex":1}),
    ];
    assert!(
        pattern_order(&candidates, &["scope/changed".into(), "**/unchanged".into()], &rows)
            .is_err(),
    );
    let rows = vec![json!({"identity":"scope/unchanged","patternIndex":0})];
    assert!(
        pattern_order(&candidates, &["scope/unchanged".into()], &rows)
            .unwrap()
            .identities
            .is_empty(),
    );
    assert!(pattern_order(&candidates, &["**".into()], &[]).is_err());
    assert!(
        pattern_order(
            &candidates,
            &["**".into()],
            &[json!({"identity":"scope/changed","patternIndex":1})]
        )
        .is_err(),
    );
}

/// Verifies that [`pattern_order`] counts every overlapping pattern match in `load_count` while deduplicating `identities`.
#[test]
fn overlapping_matches_count_loads_before_unique_publication() {
    let candidates = vec!["scope/component".into()];
    let patterns = vec!["**".into(), "scope/component".into()];
    let rows = vec![
        json!({"identity":"scope/component","patternIndex":0}),
        json!({"identity":"scope/component","patternIndex":1}),
    ];
    let selected = pattern_order(&candidates, &patterns, &rows).unwrap();
    assert_eq!(selected.load_count, 2);
    assert_eq!(selected.identities, candidates);
}

#[test]
fn empty_patterns_return_empty_selection_with_zero_loads() {
    let candidates = vec!["scope/first".into(), "scope/second".into()];
    let selected = pattern_order(&candidates, &[], &[]).unwrap();
    assert_eq!(selected.load_count, 0);
    assert!(selected.identities.is_empty());
}
