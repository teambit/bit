//! Unit tests for deduplicating and validating dependency model head references via [`include_heads`].

use super::include_heads;
use serde_json::json;

#[test]
fn context_includes_dependency_heads_once_and_rejects_invalid_heads() {
    let tracked = "a".repeat(40);
    let dependency = "b".repeat(40);
    let mut references = vec![tracked.clone()];
    include_heads(
        &[json!({"head":tracked}), json!({"head":dependency}), json!({"head":dependency})],
        &mut references,
    )
    .unwrap();
    assert_eq!(references, vec![tracked, dependency]);
    assert!(include_heads(&[json!({"head":"bad"})], &mut Vec::new()).is_err());
    assert!(include_heads(&[json!({"deprecated":true})], &mut Vec::new()).is_ok());
}

#[test]
fn empty_model_slice_leaves_existing_references_unchanged() {
    let existing = "a".repeat(40);
    let mut references = vec![existing.clone()];
    include_heads(&[], &mut references).unwrap();
    assert_eq!(references, vec![existing]);
}
