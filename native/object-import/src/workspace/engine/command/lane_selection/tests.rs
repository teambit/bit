use super::{indices_for_ids, json, versions_to_check};

#[test]
fn pattern_receipt_preserves_order_and_rejects_duplicates_or_unknown_ids() {
    let rows = vec![json!({"identity":"scope/a"}), json!({"identity":"scope/b"})];
    assert_eq!(indices_for_ids(&rows, &["scope/b".into(), "scope/a".into()]).unwrap(), vec![1, 0]);
    assert!(indices_for_ids(&rows, &["scope/a".into(), "scope/a".into()]).is_err());
    assert!(indices_for_ids(&rows, &["scope/missing".into()]).is_err());
}

#[test]
fn squash_only_checks_head_and_excluded_status_does_not_import_ancestry() {
    let first = "1".repeat(40);
    let second = "2".repeat(40);
    let rows = vec![json!({"identity":"scope/a","targetHead":second,"unchanged":false,
        "distance":{"targetOnly":[second,first]}})];
    let context = json!({"lane":{"shouldSquash":true}});
    assert_eq!(versions_to_check(&context, &rows, &[0], &[None]).unwrap(), vec![(0, vec![second])]);
    assert!(
        versions_to_check(&context, &rows, &[0], &[Some("excluded by pattern".into())])
            .unwrap()
            .is_empty(),
    );
}
