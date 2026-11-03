//! Unit tests for deduplicating and validating dependency model head references via [`include_heads`] in `bit-object-import`.
//!
//! Ensures dependency model heads are appended once via [`include_heads`] ([`context_includes_dependency_heads_once_and_rejects_invalid_heads`], [`empty_model_slice_leaves_existing_references_unchanged`]) and malformed hashes decline.

use super::include_heads;
use serde_json::json;

/// Verifies that [`include_heads`] appends unique 40-hex dependency heads once, skips headless entries, and rejects malformed hashes.
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

/// Verifies that [`include_heads`] leaves `references` unchanged when given an empty model slice.
#[test]
fn empty_model_slice_leaves_existing_references_unchanged() {
    let existing = "a".repeat(40);
    let mut references = vec![existing.clone()];
    include_heads(&[], &mut references).unwrap();
    assert_eq!(references, vec![existing]);
}
