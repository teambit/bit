//! Unit tests for snap [`Options`] pattern filtering and negation guard rules via [`filter_pattern`].
//!
//! Checks new-before-modified candidate ordering, negation-only pattern rejection, and exact [`Options`] matches via [`filter_pattern`] in `bit-object-import`.

use super::{Options, filter_pattern};
use serde_json::json;

/// Verifies that [`filter_pattern`] preserves new-before-modified candidate order and declines when no modified component matches.
#[test]
fn pattern_selection_preserves_new_before_modified_and_declines_empty_modified_match() {
    let existing = "scope/existing".to_owned();
    let new = "scope/new".to_owned();
    let unchanged = "scope/unchanged".to_owned();
    let known = vec![existing.clone(), unchanged.clone(), new.clone()];
    let candidates = vec![new.clone(), existing.clone()];
    let options: Options = serde_json::from_value(json!({"pattern":"scope/*"})).unwrap();
    assert_eq!(
        filter_pattern(candidates.clone(), &known, &[existing, new], &options).unwrap(),
        candidates,
    );
    assert!(filter_pattern(candidates, &known, &[unchanged], &options).is_err());
}

/// Verifies that [`filter_pattern`] declines a single negation pattern rather than expanding it into a glob selection.
#[test]
fn single_negation_cannot_turn_canonical_literal_resolution_into_glob_selection() {
    let known = vec!["scope/one".to_owned(), "scope/two".to_owned()];
    let options: Options = serde_json::from_value(json!({"pattern":"!scope/two"})).unwrap();
    assert!(filter_pattern(known.clone(), &known, &[known[0].clone()], &options).is_err());
}

/// Verifies that [`filter_pattern`] selects the matching known component when given an exact literal pattern in [`Options`].
#[test]
fn exact_literal_pattern_selects_matching_known_component() {
    let known = vec!["scope/one".to_owned(), "scope/two".to_owned()];
    let candidates = vec!["scope/two".to_owned()];
    let options: Options = serde_json::from_value(json!({"pattern":"scope/two"})).unwrap();
    assert_eq!(
        filter_pattern(candidates.clone(), &known, &candidates, &options).unwrap(),
        candidates,
    );
}
