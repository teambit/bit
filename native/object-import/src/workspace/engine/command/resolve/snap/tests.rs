use super::{Options, filter_pattern};
use serde_json::json;

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

#[test]
fn single_negation_cannot_turn_canonical_literal_resolution_into_glob_selection() {
    let known = vec!["scope/one".to_owned(), "scope/two".to_owned()];
    let options: Options = serde_json::from_value(json!({"pattern":"!scope/two"})).unwrap();
    assert!(filter_pattern(known.clone(), &known, &[known[0].clone()], &options).is_err());
}
