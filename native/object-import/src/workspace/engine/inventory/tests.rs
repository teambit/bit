use super::validate_prefixes;
#[test]
fn parent_budget_declines_before_recursive_policy_evaluation() {
    assert!(validate_prefixes(&[format!("{}file", "a/".repeat(129))]).is_err());
    assert!(validate_prefixes(&vec![format!("{}file", "a/".repeat(128)); 4096]).is_err());
    assert!(validate_prefixes(&["a/b/file".to_owned()]).is_ok());
}
