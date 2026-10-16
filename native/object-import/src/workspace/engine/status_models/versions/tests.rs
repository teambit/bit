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
