use super::{Entry, filter};

fn entry(identity: &str) -> Entry {
    Entry { identity: identity.into(), head: "a".repeat(40), hidden: false }
}
#[test]
fn switch_patterns_preserve_multimatch_order_exclusion_reinclusion_and_ignore_versions() {
    let entries = [entry("scope/alpha"), entry("scope/beta"), entry("scope/nested/alpha")];
    assert_eq!(
        filter("scope/beta,scope/**,!scope/alpha,scope/alpha@0.0.1", &entries).unwrap(),
        ["scope/beta", "scope/nested/alpha", "scope/alpha"],
    );
    assert_eq!(filter("!scope/alpha", &entries).unwrap(), ["scope/beta", "scope/nested/alpha"]);
}
#[test]
fn switch_patterns_use_full_id_and_no_match_is_the_published_error() {
    let error = filter("alpha", &[entry("scope/alpha")]).err().unwrap();
    assert_eq!(error.to_string(), r#"unable to find any component matching the "alpha" pattern"#);
    assert!(filter("$modified", &[entry("scope/alpha")]).is_err());
}
